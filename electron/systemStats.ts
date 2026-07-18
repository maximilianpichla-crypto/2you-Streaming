import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface SystemStats {
  cpuPercent: number | null
  cpuTempC: number | null
  ramPercent: number | null
  ramUsedGb: number | null
  ramTotalGb: number | null
  gpuPercent: number | null
  gpuTempC: number | null
  gpuName: string | null
}

let prevCpu: { idle: number; total: number } | null = null
let cachedHw: {
  at: number
  gpuPercent: number | null
  gpuTempC: number | null
  gpuName: string | null
  cpuTempC: number | null
} = {
  at: 0,
  gpuPercent: null,
  gpuTempC: null,
  gpuName: null,
  cpuTempC: null,
}

function readCpuSnapshot(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const cpu of os.cpus()) {
    const t = cpu.times
    idle += t.idle
    total += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return { idle, total }
}

function cpuPercent(): number | null {
  const now = readCpuSnapshot()
  if (!prevCpu) {
    prevCpu = now
    return null
  }
  const idleDelta = now.idle - prevCpu.idle
  const totalDelta = now.total - prevCpu.total
  prevCpu = now
  if (totalDelta <= 0) return 0
  const usage = 1 - idleDelta / totalDelta
  return Math.round(Math.min(100, Math.max(0, usage * 100)))
}

function ramStats(): Pick<
  SystemStats,
  'ramPercent' | 'ramUsedGb' | 'ramTotalGb'
> {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  return {
    ramPercent: Math.round((used / total) * 100),
    ramUsedGb: Math.round((used / 1024 / 1024 / 1024) * 10) / 10,
    ramTotalGb: Math.round((total / 1024 / 1024 / 1024) * 10) / 10,
  }
}

function parseCelsius(raw: string): number | null {
  const n = Number.parseFloat(raw.trim())
  if (!Number.isFinite(n)) return null
  // plausibel für CPU/GPU
  if (n < 0 || n > 120) return null
  return Math.round(n)
}

async function readNvidiaGpu(): Promise<{
  percent: number | null
  tempC: number | null
  name: string | null
}> {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=utilization.gpu,temperature.gpu,name',
        '--format=csv,noheader,nounits',
      ],
      { windowsHide: true, timeout: 2500 },
    )
    const line = stdout.toString('utf8').trim().split(/\r?\n/)[0] ?? ''
    const parts = line.split(',').map((s) => s.trim())
    const percent = Number.parseInt(parts[0] ?? '', 10)
    const tempC = parseCelsius(parts[1] ?? '')
    const name = parts.slice(2).join(', ') || null
    return {
      percent: Number.isFinite(percent) ? percent : null,
      tempC,
      name,
    }
  } catch {
    return { percent: null, tempC: null, name: null }
  }
}

async function readWindowsGpuUtil(): Promise<number | null> {
  if (process.platform !== 'win32') return null
  try {
    const script = `
$ErrorActionPreference = 'Stop'
$c = Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop
$vals = $c.CounterSamples | Where-Object { $_.CookedValue -gt 0 } | ForEach-Object { $_.CookedValue }
if (-not $vals) { Write-Output '0'; exit 0 }
$avg = ($vals | Measure-Object -Average).Average
[math]::Round([double]$avg)
`.trim()
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 4000 },
    )
    const n = Number.parseInt(stdout.toString('utf8').trim(), 10)
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null
  } catch {
    return null
  }
}

/**
 * CPU-Temp (Windows): ThermalZone / ACPI, Werte oft in Zehntel-Kelvin.
 * Liefert JSON: { cpuTempC }
 */
async function readWindowsCpuTemp(): Promise<number | null> {
  if (process.platform !== 'win32') return null
  try {
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
function FromKelvinTenths([double]$k) {
  $c = ($k / 10.0) - 273.15
  if ($c -ge 0 -and $c -le 120) { return [math]::Round($c) }
  return $null
}
$temps = @()

# 1) ACPI Thermal Zones
Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue |
  ForEach-Object {
    $t = FromKelvinTenths([double]$_.CurrentTemperature)
    if ($null -ne $t) { $temps += $t }
  }

# 2) Thermal Zone Information (Perf)
Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue |
  ForEach-Object {
    $raw = [double]$_.Temperature
    if ($raw -gt 200) { $t = FromKelvinTenths($raw) }
    else { $t = if ($raw -ge 0 -and $raw -le 120) { [math]::Round($raw) } else { $null } }
    if ($null -ne $t) { $temps += $t }
  }

if ($temps.Count -eq 0) { Write-Output ''; exit 0 }
# Typisch: höchster sinnvoller Kern-/Zone-Wert
($temps | Measure-Object -Maximum).Maximum
`.trim()
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 5000 },
    )
    return parseCelsius(stdout.toString('utf8').trim())
  } catch {
    return null
  }
}

async function refreshHardware(): Promise<void> {
  const now = Date.now()
  if (now - cachedHw.at < 2500) return

  const nvidia = await readNvidiaGpu()
  let gpuPercent = nvidia.percent
  if (gpuPercent == null) {
    gpuPercent = await readWindowsGpuUtil()
  }
  const cpuTempC = await readWindowsCpuTemp()

  cachedHw = {
    at: now,
    gpuPercent,
    gpuTempC: nvidia.tempC,
    gpuName: nvidia.name,
    cpuTempC,
  }
}

export async function getSystemStats(): Promise<SystemStats> {
  const cpu = cpuPercent()
  const ram = ramStats()
  await refreshHardware()
  return {
    cpuPercent: cpu,
    cpuTempC: cachedHw.cpuTempC,
    ...ram,
    gpuPercent: cachedHw.gpuPercent,
    gpuTempC: cachedHw.gpuTempC,
    gpuName: cachedHw.gpuName,
  }
}
