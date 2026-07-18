import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { autoUpdater } from 'electron-updater'
import type { UpdateDownloadedEvent } from 'electron-updater'

export type AutoUpdateStatus = {
  state:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  version?: string
  percent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  message?: string
}

type StatusListener = (status: AutoUpdateStatus) => void

let listener: StatusListener | null = null
let lastStatus: AutoUpdateStatus = { state: 'idle' }
let started = false
let canAutoRestart: () => boolean = () => true
let autoInstallTimer: ReturnType<typeof setTimeout> | null = null
let pendingInstallerPath: string | null = null
let installStarted = false

function emit(partial: Partial<AutoUpdateStatus> & { state: AutoUpdateStatus['state'] }) {
  lastStatus = { ...lastStatus, ...partial }
  listener?.(lastStatus)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updates:autoStatus', lastStatus)
    }
  }
}

export function getAutoUpdateStatus(): AutoUpdateStatus {
  return { ...lastStatus }
}

export function onAutoUpdateStatus(cb: StatusListener): void {
  listener = cb
}

function clearAutoInstallTimer(): void {
  if (autoInstallTimer) {
    clearTimeout(autoInstallTimer)
    autoInstallTimer = null
  }
}

/**
 * Installer selbst mit /S + --updated starten.
 * Umgeht electron-updater-Fallback (shell.openPath ohne Flags → sichtbarer Wizard).
 */
function spawnSilentInstaller(installerPath: string, forceRunAfter: boolean): boolean {
  if (!fs.existsSync(installerPath)) {
    emit({
      state: 'error',
      message: `Update-Datei fehlt: ${installerPath}`,
    })
    return false
  }

  const installDir = path.dirname(process.execPath)
  // /D= muss bei NSIS das letzte Argument sein
  const args = ['--updated', '/S']
  if (forceRunAfter) args.push('--force-run')
  args.push(`/D=${installDir}`)

  try {
    const child = spawn(installerPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', (err) => {
      console.error('[autoUpdate] spawn failed', err)
      // Letzter Fallback: quitAndInstall still (nicht openPath)
      autoUpdater.autoInstallOnAppQuit = false
      try {
        autoUpdater.quitAndInstall(true, forceRunAfter)
      } catch (e) {
        emit({
          state: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })
    child.unref()
    return true
  } catch (err) {
    emit({
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/** Still installieren — kein NSIS-Assistent. */
function runSilentInstall(forceRunAfter: boolean): boolean {
  if (lastStatus.state !== 'downloaded' && !pendingInstallerPath) return false
  if (installStarted) return true
  clearAutoInstallTimer()
  installStarted = true
  // Verhindert zweiten Install-Versuch von electron-updater beim Quit (ggf. ohne /S)
  autoUpdater.autoInstallOnAppQuit = false

  emit({
    state: 'downloaded',
    message: 'Update wird still installiert…',
  })

  const installer = pendingInstallerPath
  setImmediate(() => {
    let ok = false
    if (installer) {
      ok = spawnSilentInstaller(installer, forceRunAfter)
    }
    if (!ok) {
      autoUpdater.quitAndInstall(true, forceRunAfter)
    } else {
      app.quit()
    }
  })
  return true
}

/**
 * Nach Download: ohne Stream sofort still neu starten.
 * Während eines Streams: beim Beenden still installieren.
 */
function scheduleSilentAutoInstall(version?: string): void {
  clearAutoInstallTimer()
  if (!canAutoRestart()) {
    emit({
      state: 'downloaded',
      version,
      percent: 100,
      message:
        'Update geladen — wird beim Beenden still installiert (kein Installer-Fenster)',
    })
    // Beim Beenden still starten (mit /S), kein sichtbarer Wizard
    app.once('before-quit', () => {
      if (installStarted || !pendingInstallerPath) return
      installStarted = true
      autoUpdater.autoInstallOnAppQuit = false
      spawnSilentInstaller(pendingInstallerPath, true)
    })
    return
  }

  emit({
    state: 'downloaded',
    version,
    percent: 100,
    message: 'Update geladen — installiert in wenigen Sekunden still…',
  })

  autoInstallTimer = setTimeout(() => {
    autoInstallTimer = null
    if (installStarted) return
    if (!canAutoRestart()) {
      emit({
        state: 'downloaded',
        version,
        percent: 100,
        message:
          'Update bereit — Stream läuft, Installation beim Beenden (still)',
      })
      return
    }
    runSilentInstall(true)
  }, 6000)
}

/** Silent auto-update from GitHub Releases (NSIS). Nur in gepackter App. */
export function setupAutoUpdater(options?: {
  canAutoRestart?: () => boolean
}): void {
  if (started) return
  started = true

  if (options?.canAutoRestart) {
    canAutoRestart = options.canAutoRestart
  }

  if (!app.isPackaged) {
    emit({ state: 'idle', message: 'Dev-Modus — Auto-Update deaktiviert' })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.disableWebInstaller = true
  // Unsignierte Builds: sonst schlägt die Signaturprüfung fehl
  autoUpdater.forceDevUpdateConfig = false

  autoUpdater.on('checking-for-update', () => {
    emit({ state: 'checking', message: 'Suche Update…' })
  })

  autoUpdater.on('update-available', (info) => {
    emit({
      state: 'available',
      version: info.version,
      message: `Update ${info.version} gefunden — wird geladen…`,
    })
  })

  autoUpdater.on('update-not-available', () => {
    emit({ state: 'not-available', message: 'App ist aktuell' })
  })

  autoUpdater.on('download-progress', (p) => {
    emit({
      state: 'downloading',
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
      message: `Update wird geladen… ${Math.round(p.percent)}%`,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
    pendingInstallerPath = info.downloadedFile || null
    installStarted = false
    emit({
      state: 'downloaded',
      version: info.version,
      percent: 100,
      message: `Update ${info.version} geladen`,
    })
    scheduleSilentAutoInstall(info.version)
  })

  autoUpdater.on('error', (err) => {
    clearAutoInstallTimer()
    emit({
      state: 'error',
      message: err?.message || 'Update fehlgeschlagen',
    })
  })
}

export async function checkAutoUpdate(): Promise<AutoUpdateStatus> {
  setupAutoUpdater()
  if (!app.isPackaged) return getAutoUpdateStatus()
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    emit({
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
  return getAutoUpdateStatus()
}

/** Sofort still installieren und App neu starten (kein Installer-Assistent). */
export function installAutoUpdateNow(): boolean {
  return runSilentInstall(true)
}
