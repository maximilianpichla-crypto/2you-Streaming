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
let canAutoRestart: () => boolean = () => true
let autoInstallTimer: ReturnType<typeof setTimeout> | null = null

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

/** Still installieren — kein NSIS-Assistent (/S). */
function runSilentInstall(forceRunAfter: boolean): boolean {
  if (lastStatus.state !== 'downloaded') return false
  clearAutoInstallTimer()
  emit({
    state: 'downloaded',
    message: 'Update wird still installiert…',
  })
  setImmediate(() => {
    // isSilent=true → /S (kein Wizard), isForceRunAfter → App danach starten
    autoUpdater.quitAndInstall(true, forceRunAfter)
  })
  return true
}

/**
 * Nach Download: ohne Stream sofort still neu starten.
 * Während eines Streams: beim Beenden still installieren (electron-updater).
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
    if (lastStatus.state !== 'downloaded') return
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
