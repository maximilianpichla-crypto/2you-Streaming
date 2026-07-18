import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppConfig,
  DisplayInfo,
  Scene,
  StartStreamPayload,
  StreamSettings,
  StreamStatus,
  WindowInfo,
} from '../src/shared/types'

export type ChatStatusPayload = {
  status: 'idle' | 'connecting' | 'connected' | 'error'
  channel: string
  error: string | null
}

export type ChatMessagePayload = {
  id: string
  user: string
  color: string
  text: string
  system?: boolean
  emotes?: string
  badgesRaw?: string
  badges?: Record<string, string>
  roomId?: string
}

const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveSettings: (settings: StreamSettings): Promise<AppConfig> =>
    ipcRenderer.invoke('config:saveSettings', settings),
  saveTheme: (theme: import('../src/shared/types').ThemeColors): Promise<AppConfig> =>
    ipcRenderer.invoke('config:saveTheme', theme),
  saveLayout: (layout: import('../src/shared/types').UiLayout): Promise<AppConfig> =>
    ipcRenderer.invoke('config:saveLayout', layout),
  saveScenes: (scenes: Scene[], activeSceneId: string): Promise<AppConfig> =>
    ipcRenderer.invoke('config:saveScenes', scenes, activeSceneId),
  saveAll: (config: AppConfig): Promise<AppConfig> =>
    ipcRenderer.invoke('config:saveAll', config),
  getDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('devices:displays'),
  getWindows: (): Promise<WindowInfo[]> => ipcRenderer.invoke('devices:windows'),
  ensureMicPermission: (): Promise<boolean> =>
    ipcRenderer.invoke('devices:micPermission'),
  getDshowDevices: (): Promise<{ video: string[]; audio: string[] }> =>
    ipcRenderer.invoke('devices:dshow'),
  openFileDialog: (
    kind: 'image' | 'media' | 'slideshow' | 'video',
  ): Promise<string[] | null> => ipcRenderer.invoke('dialog:openFile', { kind }),
  saveDroppedFile: (payload: {
    name: string
    data: ArrayBuffer
  }): Promise<string> => ipcRenderer.invoke('fs:saveDroppedFile', payload),
  pickWindow: (
    kind: 'window' | 'game' = 'window',
  ): Promise<{
    kind: 'window' | 'game'
    title: string
    capturerId: string
  } | null> => ipcRenderer.invoke('pick:window', kind),
  cancelPickWindow: (): Promise<{ ok: true }> => ipcRenderer.invoke('pick:cancel'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  checkUpdates: (): Promise<import('../src/shared/updates').UpdateCheckResult | null> =>
    ipcRenderer.invoke('updates:check'),
  dismissUpdates: (ids: string[]): Promise<{ ok: true }> =>
    ipcRenderer.invoke('updates:dismiss', ids),
  openUpdateDownload: (url?: string): Promise<boolean> =>
    ipcRenderer.invoke('updates:openDownload', url),
  onPickHotkey: (
    callback: (payload: { kind: 'window' | 'game' }) => void,
  ): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { kind: 'window' | 'game' },
    ) => callback(payload)
    ipcRenderer.on('pick:hotkey', listener)
    return () => ipcRenderer.removeListener('pick:hotkey', listener)
  },
  onPickStatus: (
    callback: (payload: { active: boolean; kind: 'window' | 'game' }) => void,
  ): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { active: boolean; kind: 'window' | 'game' },
    ) => callback(payload)
    ipcRenderer.on('pick:status', listener)
    return () => ipcRenderer.removeListener('pick:status', listener)
  },
  getFfmpegPath: (): Promise<string> => ipcRenderer.invoke('ffmpeg:path'),
  getAvailableEncoders: (): Promise<import('../src/shared/types').VideoEncoderId[]> =>
    ipcRenderer.invoke('ffmpeg:encoders'),
  getStreamStatus: (): Promise<StreamStatus> => ipcRenderer.invoke('stream:getStatus'),
  startStream: (
    payload: StartStreamPayload,
  ): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('stream:start', payload),
  stopStream: (): Promise<{ ok: true }> => ipcRenderer.invoke('stream:stop'),
  onStreamStatus: (callback: (status: StreamStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: StreamStatus) => {
      callback(status)
    }
    ipcRenderer.on('stream:status', listener)
    return () => ipcRenderer.removeListener('stream:status', listener)
  },
  connectChat: (
    channel: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('chat:connect', channel),
  disconnectChat: (): Promise<{ ok: true }> => ipcRenderer.invoke('chat:disconnect'),
  getChatStatus: (): Promise<{ status: ChatStatusPayload['status']; channel: string }> =>
    ipcRenderer.invoke('chat:getStatus'),
  onChatStatus: (callback: (payload: ChatStatusPayload) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: ChatStatusPayload) => {
      callback(payload)
    }
    ipcRenderer.on('chat:status', listener)
    return () => ipcRenderer.removeListener('chat:status', listener)
  },
  onChatMessage: (callback: (payload: ChatMessagePayload) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: ChatMessagePayload) => {
      callback(payload)
    }
    ipcRenderer.on('chat:message', listener)
    return () => ipcRenderer.removeListener('chat:message', listener)
  },
}

contextBridge.exposeInMainWorld('twoYou', api)

export type TwoYouApi = typeof api
