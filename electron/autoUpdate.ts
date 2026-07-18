import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

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

/** Silent auto-update from GitHub Releases (NSIS). Nur in gepackter App. */
export function setupAutoUpdater(): void {
  if (started) return
  started = true

  if (!app.isPackaged) {
    emit({ state: 'idle', message: 'Dev-Modus — Auto-Update deaktiviert' })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
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

  autoUpdater.on('update-downloaded', (info) => {
    emit({
      state: 'downloaded',
      version: info.version,
      percent: 100,
      message: `Update ${info.version} bereit — wird beim Beenden installiert`,
    })
  })

  autoUpdater.on('error', (err) => {
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

/** Sofort installieren und App neu starten */
export function installAutoUpdateNow(): boolean {
  if (lastStatus.state !== 'downloaded') return false
  // isSilent=false, isForceRunAfter=true
  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true)
  })
  return true
}
