import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  session,
  systemPreferences,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, saveConfig, updateScenes, updateSettings, updateTheme, updateLayout, updateAudioSources, preserveConfigAcrossAppUpdate } from './config'
import { FfmpegStreamer, getFfmpegPath, listDshowDevices, detectAvailableEncoders } from './ffmpeg'
import { TwitchChatService } from './chat'
import { cancelWindowPick, startWindowPick, type PickKind } from './windowPick'
import {
  checkForUpdates,
  dismissUpdateIds,
  openUpdateDownload,
} from './updates'
import {
  checkAutoUpdate,
  getAutoUpdateStatus,
  installAutoUpdateNow,
  setupAutoUpdater,
} from './autoUpdate'
import {
  installPluginFromFolder,
  installPluginFromZip,
  listPlugins,
  openPluginsFolder,
  removePlugin,
  setPluginEnabled,
} from './plugins'
import { getSystemStats } from './systemStats'
import { subscribeLoopbackMeter } from './loopbackMeter'
import type {
  AppConfig,
  DisplayInfo,
  Scene,
  StartStreamPayload,
  StreamSettings,
  ThemeColors,
  WindowInfo,
} from '../src/shared/types'

let mainWindow: BrowserWindow | null = null
const streamer = new FfmpegStreamer()
const chat = new TwitchChatService()

function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.ico'),
  ]
  return candidates.find((p) => fs.existsSync(p))
}

function createWindow(): void {
  // Kein natives Menü (File/Edit/…) — nur die App-Oberfläche
  Menu.setApplicationMenu(null)

  const themeBg = loadConfig().theme?.bg ?? '#0e1116'
  const icon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '2you Streaming',
    backgroundColor: themeBg,
    frame: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  chat.setWindow(mainWindow)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    chat.setWindow(null)
    mainWindow = null
  })
}

function sendStatus(): void {
  mainWindow?.webContents.send('stream:status', streamer.getStatus())
}

streamer.onStatus(() => {
  sendStatus()
})

function registerIpc(): void {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })
  ipcMain.handle('window:isMaximized', (): boolean => {
    return mainWindow?.isMaximized() ?? false
  })

  ipcMain.handle('config:get', (): AppConfig => loadConfig())

  ipcMain.handle('config:saveSettings', (_e, settings: StreamSettings): AppConfig => {
    return updateSettings(settings)
  })

  ipcMain.handle('config:saveTheme', (_e, theme: ThemeColors): AppConfig => {
    const next = updateTheme(theme)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(theme.bg)
    }
    return next
  })

  ipcMain.handle(
    'config:saveLayout',
    (_e, layout: import('../src/shared/types').UiLayout): AppConfig => {
      return updateLayout(layout)
    },
  )

  ipcMain.handle(
    'config:saveScenes',
    (_e, scenes: Scene[], activeSceneId: string): AppConfig => {
      return updateScenes(scenes, activeSceneId)
    },
  )

  ipcMain.handle(
    'config:saveAudioSources',
    (_e, audioSources: import('../src/shared/types').StreamSource[]): AppConfig => {
      return updateAudioSources(audioSources)
    },
  )

  ipcMain.handle('config:saveAll', (_e, config: AppConfig): AppConfig => {
    saveConfig(config)
    return config
  })

  ipcMain.handle('devices:displays', async (): Promise<DisplayInfo[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 },
    })
    return sources.map((s, index) => ({
      id: s.id,
      name: s.name,
      index,
      width: s.display_id ? 1920 : 1920,
      height: 1080,
    }))
  })

  ipcMain.handle('devices:windows', async (): Promise<WindowInfo[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
    })

    // Titel → PID (für Anwendungsaudio)
    const titleToPid = new Map<string, { processId: number; processName: string }>()
    if (process.platform === 'win32') {
      try {
        const { execFile } = await import('node:child_process')
        const { promisify } = await import('node:util')
        const execFileAsync = promisify(execFile)
        const { stdout } = await execFileAsync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            "Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { '{0}|{1}|{2}' -f $_.Id, $_.ProcessName, $_.MainWindowTitle }",
          ],
          { windowsHide: true, timeout: 8000 },
        )
        for (const line of stdout.toString('utf8').split(/\r?\n/)) {
          const parts = line.split('|')
          if (parts.length < 3) continue
          const processId = Number.parseInt(parts[0], 10)
          const processName = parts[1]
          const title = parts.slice(2).join('|').trim()
          if (!title || !Number.isFinite(processId)) continue
          titleToPid.set(title, { processId, processName })
        }
      } catch {
        /* PID optional */
      }
    }

    return sources.map((s) => {
      const hit =
        titleToPid.get(s.name) ||
        [...titleToPid.entries()].find(([t]) => s.name.includes(t) || t.includes(s.name))?.[1]
      return {
        id: s.id,
        name: s.name,
        processId: hit?.processId,
        processName: hit?.processName,
      }
    })
  })

  ipcMain.handle('devices:micPermission', async (): Promise<boolean> => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone')
      if (status !== 'granted') {
        return systemPreferences.askForMediaAccess('microphone')
      }
    }
    return true
  })

  ipcMain.handle('devices:dshow', async () => listDshowDevices())

  ipcMain.handle('pick:window', async (_e, kind: PickKind = 'window') => {
    mainWindow?.webContents.send('pick:status', { active: true, kind })
    try {
      const result = await startWindowPick(kind, mainWindow)
      return result
    } finally {
      mainWindow?.webContents.send('pick:status', { active: false, kind })
    }
  })

  ipcMain.handle('pick:cancel', () => {
    cancelWindowPick()
    return { ok: true as const }
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('updates:check', () => checkForUpdates())
  ipcMain.handle('updates:dismiss', (_e, ids: string[]) => {
    dismissUpdateIds(Array.isArray(ids) ? ids : [])
    return { ok: true as const }
  })
  ipcMain.handle('updates:openDownload', (_e, url?: string) =>
    openUpdateDownload(url),
  )
  ipcMain.handle('updates:autoCheck', () => checkAutoUpdate())
  ipcMain.handle('updates:autoStatus', () => getAutoUpdateStatus())
  ipcMain.handle('updates:installNow', () => installAutoUpdateNow())
  ipcMain.handle('system:stats', () => getSystemStats())

  ipcMain.handle('plugins:list', () => listPlugins())
  ipcMain.handle('plugins:openFolder', () => openPluginsFolder())
  ipcMain.handle('plugins:installZip', () => installPluginFromZip())
  ipcMain.handle('plugins:installFolder', () => installPluginFromFolder())
  ipcMain.handle('plugins:setEnabled', (_e, id: string, enabled: boolean) =>
    setPluginEnabled(id, enabled),
  )
  ipcMain.handle('plugins:remove', (_e, id: string) => removePlugin(id))

  const meterUnsubs = new Map<string, () => void>()
  const meterVolumes = new Map<string, number>()

  ipcMain.handle(
    'audio:meterStart',
    async (
      e,
      payload: {
        id: string
        processId?: number | null
        processName?: string | null
        volume?: number
      },
    ) => {
      const prev = meterUnsubs.get(payload.id)
      prev?.()
      meterVolumes.set(payload.id, payload.volume ?? 100)
      const wc = e.sender
      const unsub = await subscribeLoopbackMeter(
        {
          processId: payload.processId,
          processName: payload.processName,
        },
        (level, peak) => {
          if (!wc.isDestroyed()) {
            wc.send('audio:meterLevel', { id: payload.id, level, peak })
          }
        },
        () => meterVolumes.get(payload.id) ?? 100,
      )
      meterUnsubs.set(payload.id, unsub)
      return { ok: true as const }
    },
  )

  ipcMain.handle(
    'audio:meterVolume',
    (_e, payload: { id: string; volume: number }) => {
      meterVolumes.set(payload.id, payload.volume)
      return { ok: true as const }
    },
  )

  ipcMain.handle('audio:meterStop', (_e, id: string) => {
    meterUnsubs.get(id)?.()
    meterUnsubs.delete(id)
    meterVolumes.delete(id)
    return { ok: true as const }
  })

  ipcMain.handle(
    'fs:saveDroppedFile',
    async (
      _e,
      payload: { name: string; data: ArrayBuffer },
    ): Promise<string> => {
      const dir = path.join(app.getPath('userData'), 'dropped')
      fs.mkdirSync(dir, { recursive: true })
      const safe = (payload.name || 'image.png').replace(/[^\w.\-]+/g, '_')
      const dest = path.join(dir, `${Date.now()}-${safe}`)
      fs.writeFileSync(dest, Buffer.from(payload.data))
      return dest
    },
  )

  ipcMain.handle(
    'dialog:openFile',
    async (
      _e,
      options: {
        kind: 'image' | 'media' | 'slideshow' | 'video'
      },
    ): Promise<string[] | null> => {
      const filters =
        options.kind === 'media' || options.kind === 'video'
          ? [
              {
                name: options.kind === 'video' ? 'Videos' : 'Medien',
                extensions:
                  options.kind === 'video'
                    ? ['mp4', 'mkv', 'mov', 'webm', 'avi', 'gif']
                    : [
                        'mp4',
                        'mkv',
                        'mov',
                        'webm',
                        'avi',
                        'mp3',
                        'wav',
                        'flac',
                        'm4a',
                      ],
              },
            ]
          : [
              {
                name: 'Bilder',
                extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
              },
            ]

      const result = await dialog.showOpenDialog(mainWindow!, {
        properties:
          options.kind === 'slideshow'
            ? ['openFile', 'multiSelections']
            : ['openFile'],
        filters: [...filters, { name: 'Alle Dateien', extensions: ['*'] }],
      })

      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths
    },
  )

  ipcMain.handle('ffmpeg:path', (): string => getFfmpegPath())
  ipcMain.handle('ffmpeg:encoders', async () => detectAvailableEncoders())

  ipcMain.handle('stream:getStatus', () => streamer.getStatus())

  ipcMain.handle('stream:start', async (_e, payload: StartStreamPayload) => {
    try {
      await streamer.start(payload)
      return { ok: true as const }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle('stream:restart', async (_e, payload: StartStreamPayload) => {
    try {
      await streamer.restart(payload)
      return { ok: true as const }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle('stream:stop', () => {
    streamer.stop()
    return { ok: true as const }
  })

  ipcMain.handle('chat:connect', async (_e, channel: string) => chat.connect(channel))
  ipcMain.handle('chat:disconnect', async () => {
    await chat.disconnect()
    return { ok: true as const }
  })
  ipcMain.handle('chat:getStatus', () => chat.getStatus())
}

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    })
    if (sources[0]) {
      callback({ video: sources[0] })
    } else {
      callback({})
    }
  })

  registerIpc()
  // App-Update: Szenen, Quellen, Settings bleiben in userData erhalten
  preserveConfigAcrossAppUpdate()
  setupAutoUpdater({
    canAutoRestart: () => !streamer.getStatus().streaming,
  })
  createWindow()
  // Beim Start still Update von GitHub holen (nur gepackt)
  void checkAutoUpdate()

  const runPick = (kind: PickKind) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.show()
    mainWindow.webContents.send('pick:hotkey', { kind })
  }

  const okF = globalShortcut.register('CommandOrControl+Shift+F', () =>
    runPick('window'),
  )
  const okG = globalShortcut.register('CommandOrControl+Shift+G', () =>
    runPick('game'),
  )
  if (!okF) console.warn('[hotkey] Ctrl+Shift+F konnte nicht registriert werden')
  if (!okG) console.warn('[hotkey] Ctrl+Shift+G konnte nicht registriert werden')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  cancelWindowPick()
})

app.on('window-all-closed', () => {
  streamer.stop()
  void chat.disconnect()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  streamer.stop()
  void chat.disconnect()
  cancelWindowPick()
})
