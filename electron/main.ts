import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  session,
  systemPreferences,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, saveConfig, updateScenes, updateSettings, updateTheme, updateLayout } from './config'
import { FfmpegStreamer, getFfmpegPath, listDshowDevices, detectAvailableEncoders } from './ffmpeg'
import { TwitchChatService } from './chat'
import { cancelWindowPick, startWindowPick, type PickKind } from './windowPick'
import {
  checkForUpdates,
  dismissUpdateIds,
  openUpdateDownload,
} from './updates'
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

function createWindow(): void {
  const themeBg = loadConfig().theme?.bg ?? '#0e1116'
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '2you Streaming',
    backgroundColor: themeBg,
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
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
    }))
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
  createWindow()

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
