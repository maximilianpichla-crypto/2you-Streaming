import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  buildWasapiCaptureArgs,
  getWasapiCapturePath,
  wasapiCaptureAvailable,
} from './wasapiCapture'

const execFileAsync = promisify(execFile)

export type LoopbackMeterPayload = {
  processId?: number | null
  processName?: string | null
  processIds?: number[]
}

export async function listPidsByProcessName(
  processName: string,
): Promise<number[]> {
  const name = processName.replace(/\.exe$/i, '').trim()
  if (!name || process.platform !== 'win32') return []
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-Process -Name '${name.replace(/'/g, '')}' -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }`,
      ],
      { windowsHide: true, timeout: 5000 },
    )
    return stdout
      .toString('utf8')
      .split(/\r?\n/)
      .map((l) => Number.parseInt(l.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  } catch {
    return []
  }
}

/** null = Desktop (alle Apps), sonst PID-Liste */
export async function resolveLoopbackPids(
  opts: LoopbackMeterPayload,
): Promise<number[] | null> {
  const hasFilter =
    (opts.processId != null && opts.processId > 0) ||
    Boolean(opts.processName?.trim()) ||
    Boolean(opts.processIds?.length)
  if (!hasFilter) return null

  const set = new Set<number>()
  for (const id of opts.processIds ?? []) {
    if (id > 0) set.add(id)
  }
  if (opts.processId && opts.processId > 0) set.add(opts.processId)
  if (opts.processName) {
    for (const id of await listPidsByProcessName(opts.processName)) set.add(id)
  }
  return [...set]
}

type MeterListener = {
  onLevel: (level: number, peak: number) => void
  getVolume: () => number
}

type MeterSession = {
  proc: ChildProcessWithoutNullStreams
  listeners: Set<MeterListener>
  peakHold: number
  peakDecay: number
}

const sessions = new Map<string, MeterSession>()

function analyzePcm16le(
  buf: Buffer,
  volumeGain: number,
): { level: number; peak: number } {
  if (buf.length < 4) return { level: 0, peak: 0 }
  const samples = Math.floor(buf.length / 2)
  let sum = 0
  let max = 0
  for (let i = 0; i < samples; i++) {
    const v = buf.readInt16LE(i * 2) / 32768
    sum += v * v
    max = Math.max(max, Math.abs(v))
  }
  const rms = Math.sqrt(sum / samples)
  const gain = Math.max(0, Math.min(1, volumeGain))
  return {
    level: Math.min(1, rms * 2.8 * gain),
    peak: Math.min(1, max * 1.4 * gain),
  }
}

function makeKey(pids: number[] | null): string {
  if (pids == null) return 'desktop'
  return `pids:${[...pids].sort((a, b) => a - b).join(',')}`
}

/**
 * WASAPI-Pegel für Desktop- oder App-Audio.
 * Rückgabe: unsubscribe()
 */
export async function subscribeLoopbackMeter(
  opts: LoopbackMeterPayload,
  onLevel: (level: number, peak: number) => void,
  getVolume: () => number = () => 100,
): Promise<() => void> {
  if (!wasapiCaptureAvailable()) {
    onLevel(0, 0)
    return () => {}
  }

  const pids = await resolveLoopbackPids(opts)
  if (pids && pids.length === 0) {
    onLevel(0, 0)
    return () => {}
  }

  const key = makeKey(pids)
  let session = sessions.get(key)

  if (!session) {
    const proc = spawn(getWasapiCapturePath(), buildWasapiCaptureArgs(pids), {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams

    session = {
      proc,
      listeners: new Set(),
      peakHold: 0,
      peakDecay: 0,
    }
    sessions.set(key, session)

    proc.stdout.on('data', (buf: Buffer) => {
      const s = sessions.get(key)
      if (!s || s.listeners.size === 0) return

      let maxLevel = 0
      let maxPeak = 0
      for (const listener of s.listeners) {
        const { level, peak } = analyzePcm16le(buf, listener.getVolume() / 100)
        maxLevel = Math.max(maxLevel, level)
        maxPeak = Math.max(maxPeak, peak)
      }

      if (maxPeak >= s.peakHold) {
        s.peakHold = maxPeak
        s.peakDecay = 10
      } else if (s.peakDecay > 0) {
        s.peakDecay -= 1
      } else {
        s.peakHold = Math.max(0, s.peakHold - 0.02)
      }

      const held = Math.max(s.peakHold, maxPeak)
      for (const listener of s.listeners) {
        const { level, peak } = analyzePcm16le(buf, listener.getVolume() / 100)
        listener.onLevel(level, Math.max(peak, held * (listener.getVolume() / 100)))
      }
    })

    proc.on('close', () => sessions.delete(key))
    proc.on('error', () => sessions.delete(key))
  }

  const listener: MeterListener = { onLevel, getVolume }
  session.listeners.add(listener)

  return () => {
    const s = sessions.get(key)
    if (!s) return
    s.listeners.delete(listener)
    if (s.listeners.size === 0) {
      try {
        s.proc.kill()
      } catch {
        /* ignore */
      }
      sessions.delete(key)
    }
  }
}
