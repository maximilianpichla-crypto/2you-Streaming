import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScenesPanel } from './components/ScenesPanel'
import { SourcesPanel } from './components/SourcesPanel'
import { AudioSourcesPanel } from './components/AudioSourcesPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { StreamPanel } from './components/StreamPanel'
import { ChatPanel } from './components/ChatPanel'
import { SettingsModal, mapTabToCategory, type SettingsCategory } from './components/SettingsModal'
import { FlexibleWorkspace, resetUiLayout } from './components/FlexibleWorkspace'
import type {
  AppConfig,
  DisplayInfo,
  MediaDeviceInfoLite,
  Scene,
  StreamSettings,
  StreamSource,
  StreamStatus,
  ThemeColors,
  UiLayout,
  VideoEncoderId,
  WindowInfo,
} from './shared/types'
import {
  createDefaultConfig,
  createSource,
  defaultTheme,
  normalizeUiLayout,
  isVisualSource,
  isAudioSource,
} from './shared/types'
import appIcon from './assets/app-icon.png'
import { UpdateBanner } from './components/UpdateBanner'
import { applyTheme } from './theme'

const emptyStatus: StreamStatus = {
  streaming: false,
  startedAt: null,
  bitrateKbps: null,
  fps: null,
  error: null,
  lastLogLine: null,
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(createDefaultConfig)
  const [ready, setReady] = useState(false)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [windows, setWindows] = useState<WindowInfo[]>([])
  const [cameras, setCameras] = useState<MediaDeviceInfoLite[]>([])
  const [mics, setMics] = useState<MediaDeviceInfoLite[]>([])
  const [speakers, setSpeakers] = useState<MediaDeviceInfoLite[]>([])
  const [availableEncoders, setAvailableEncoders] = useState<VideoEncoderId[]>(['x264'])
  const [status, setStatus] = useState<StreamStatus>(emptyStatus)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('output')
  const [ffmpegPath, setFfmpegPath] = useState('')
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null)
  const [pickBanner, setPickBanner] = useState<string | null>(null)
  const [updateCheckRequest, setUpdateCheckRequest] = useState(0)
  const [updateToast, setUpdateToast] = useState<string | null>(null)
  const updateToastTimer = useRef<number | null>(null)

  function showUpdateToast(message: string) {
    setUpdateToast(message)
    if (updateToastTimer.current != null) {
      window.clearTimeout(updateToastTimer.current)
    }
    updateToastTimer.current = window.setTimeout(() => setUpdateToast(null), 3500)
  }

  function handleUpdateChecked(
    result: import('./shared/updates').UpdateCheckResult | null,
  ) {
    if (!result) {
      showUpdateToast('Update-Check fehlgeschlagen (kein Feed erreichbar).')
      return
    }
    const hasNews =
      result.hasVersionUpdate || (result.announcements?.length ?? 0) > 0
    if (hasNews) {
      showUpdateToast(
        result.hasVersionUpdate
          ? `Update verfügbar: v${result.feed.version}`
          : 'Neue Nachricht verfügbar.',
      )
    } else {
      showUpdateToast(`Keine Updates — du nutzt v${result.appVersion}.`)
    }
  }

  const activeScene = useMemo(
    () => config.scenes.find((s) => s.id === config.activeSceneId) ?? config.scenes[0],
    [config],
  )

  const persistScenes = useCallback(
    async (scenes: Scene[], activeSceneId: string) => {
      const cleaned = scenes.map((scene) => ({
        ...scene,
        sources: scene.sources.filter((s) => isVisualSource(s.type)),
      }))
      const next = await window.twoYou.saveScenes(cleaned, activeSceneId)
      setConfig(next)
    },
    [],
  )

  const persistAudioSources = useCallback(async (audioSources: StreamSource[]) => {
    const next = await window.twoYou.saveAudioSources(
      audioSources.filter((s) => isAudioSource(s.type)),
    )
    setConfig(next)
  }, [])

  const persistSettings = useCallback(async (settings: StreamSettings) => {
    const next = await window.twoYou.saveSettings(settings)
    setConfig(next)
  }, [])

  const persistTheme = useCallback(async (theme: ThemeColors) => {
    applyTheme(theme)
    setConfig((c) => ({ ...c, theme }))
    const next = await window.twoYou.saveTheme(theme)
    setConfig(next)
  }, [])

  const persistLayout = useCallback(async (layout: UiLayout) => {
    const normalized = normalizeUiLayout(layout)
    setConfig((c) => ({ ...c, layout: normalized }))
    const next = await window.twoYou.saveLayout(normalized)
    setConfig(next)
  }, [])

  const layoutPersistTimer = useRef<number | null>(null)
  const pendingLayoutRef = useRef<UiLayout | null>(null)

  function schedulePersistLayout(layout: UiLayout) {
    const normalized = normalizeUiLayout(layout)
    pendingLayoutRef.current = normalized
    setConfig((c) => ({ ...c, layout: normalized }))
    if (layoutPersistTimer.current != null) {
      window.clearTimeout(layoutPersistTimer.current)
    }
    layoutPersistTimer.current = window.setTimeout(() => {
      const pending = pendingLayoutRef.current
      if (pending) void window.twoYou.saveLayout(pending).then(setConfig)
    }, 250)
  }

  useEffect(() => {
    applyTheme(config.theme ?? defaultTheme())
  }, [config.theme])

  const pickHandlerRef = useRef<(kind: 'window' | 'game') => Promise<void>>(
    async () => {},
  )

  async function handlePickWindowCapture(kind: 'window' | 'game') {
    setPickBanner(
      kind === 'game'
        ? 'Klicke auf ein Spiel / Fenster… (Esc = Abbruch)'
        : 'Klicke auf ein Fenster… (Esc = Abbruch)',
    )
    try {
      const result = await window.twoYou.pickWindow(kind)
      if (!result) return
      const list = await window.twoYou.getWindows()
      setWindows(list)
      const source = createSource(kind, result.title)
      const next: StreamSource = {
        ...source,
        deviceId: result.capturerId || undefined,
        deviceLabel: result.title,
        settings: {
          ...source.settings,
          windowTitle: result.title,
          captureCursor: true,
        },
      }
      setSelectedSourceId(next.id)
      setConfig((c) => {
        const scenes = c.scenes.map((scene) => {
          if (scene.id !== c.activeSceneId) return scene
          return { ...scene, sources: [...scene.sources, next] }
        })
        void persistScenes(scenes, c.activeSceneId)
        return { ...c, scenes }
      })
    } finally {
      setPickBanner(null)
    }
  }
  pickHandlerRef.current = handlePickWindowCapture

  useEffect(() => {
    const unsubHotkey = window.twoYou.onPickHotkey(({ kind }) => {
      void pickHandlerRef.current(kind)
    })
    return () => unsubHotkey()
  }, [])

  useEffect(() => {
    let unsub = () => {}
    async function boot() {
      const cfg = await window.twoYou.getConfig()
      setConfig(cfg)
      applyTheme(cfg.theme ?? defaultTheme())
      const [d, w] = await Promise.all([
        window.twoYou.getDisplays(),
        window.twoYou.getWindows(),
      ])
      setDisplays(d)
      setWindows(w)
      await window.twoYou.ensureMicPermission()
      const dshow = await window.twoYou.getDshowDevices()
      const devices = await navigator.mediaDevices.enumerateDevices()
      setCameras(
        devices
          .filter((x) => x.kind === 'videoinput')
          .map((x) => ({
            deviceId: x.deviceId,
            label: x.label || 'Kamera',
            kind: 'videoinput' as const,
          })),
      )
      const audioList =
        dshow.audio.length > 0
          ? dshow.audio.map((label) => ({
              deviceId: label,
              label,
              kind: 'audioinput' as const,
            }))
          : devices
              .filter((x) => x.kind === 'audioinput')
              .map((x) => ({
                deviceId: x.deviceId,
                label: x.label || 'Mikrofon',
                kind: 'audioinput' as const,
              }))
      setMics(audioList)

      const outputLike = /stereo mix|cable|virtual|vb-audio|what u hear|loopback|speakers|lautsprecher|ausgabe|output|mix/i
      const speakerList = audioList
        .filter((a) => outputLike.test(a.label))
        .map((a) => ({ ...a, kind: 'audiooutput' as const }))
      setSpeakers(
        speakerList.length > 0
          ? speakerList
          : audioList.map((a) => ({ ...a, kind: 'audiooutput' as const })),
      )

      setStatus(await window.twoYou.getStreamStatus())
      try {
        const encoders = await window.twoYou.getAvailableEncoders()
        setAvailableEncoders(encoders.length ? encoders : ['x264'])
      } catch {
        setAvailableEncoders(['x264'])
      }
      try {
        setFfmpegPath(await window.twoYou.getFfmpegPath())
      } catch {
        setFfmpegPath('')
      }
      unsub = window.twoYou.onStreamStatus(setStatus)
      setReady(true)
    }
    void boot()
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!status.streaming) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [status.streaming])

  void tick

  function updateActiveScene(mutator: (scene: Scene) => Scene) {
    if (!activeScene) return
    const scenes = config.scenes.map((s) => (s.id === activeScene.id ? mutator(s) : s))
    void persistScenes(scenes, config.activeSceneId)
  }

  const transformPersistTimer = useRef<number | null>(null)
  const pendingScenesRef = useRef<{ scenes: Scene[]; activeSceneId: string } | null>(
    null,
  )

  function updateTransformLocal(
    sourceId: string,
    transform: import('./shared/types').SourceTransform,
  ) {
    setConfig((c) => {
      const scenes = c.scenes.map((scene) => {
        if (scene.id !== c.activeSceneId) return scene
        return {
          ...scene,
          sources: scene.sources.map((s) =>
            s.id === sourceId ? { ...s, transform } : s,
          ),
        }
      })
      pendingScenesRef.current = { scenes, activeSceneId: c.activeSceneId }
      return { ...c, scenes }
    })
    if (transformPersistTimer.current != null) {
      window.clearTimeout(transformPersistTimer.current)
    }
    transformPersistTimer.current = window.setTimeout(() => {
      const pending = pendingScenesRef.current
      if (pending) void persistScenes(pending.scenes, pending.activeSceneId)
    }, 280)
  }

  async function handleToggleDelay() {
    const nextEnabled = !config.settings.streamDelayEnabled
    const nextSettings = {
      ...config.settings,
      streamDelayEnabled: nextEnabled,
      streamDelaySeconds: config.settings.streamDelaySeconds || 10,
    }
    setConfig((c) => ({ ...c, settings: nextSettings }))
    await persistSettings(nextSettings)

    if (!status.streaming || !activeScene) return

    setBusy(true)
    const displaySource = activeScene.sources.find((s) => s.type === 'display' && s.enabled)
    const displayIndex = displaySource?.deviceId ? Number(displaySource.deviceId) : 0
    const result = await window.twoYou.restartStream({
      settings: nextSettings,
      scene: activeScene,
      audioSources: config.audioSources ?? [],
      displayIndex,
    })
    setBusy(false)
    if (!result.ok) {
      setStatus((s) => ({ ...s, error: result.error }))
    }
  }

  async function handleStart() {
    if (!activeScene) return
    setBusy(true)
    await persistSettings(config.settings)
    const displaySource = activeScene.sources.find((s) => s.type === 'display' && s.enabled)
    const displayIndex = displaySource?.deviceId ? Number(displaySource.deviceId) : 0
    const result = await window.twoYou.startStream({
      settings: config.settings,
      scene: activeScene,
      audioSources: config.audioSources ?? [],
      displayIndex,
    })
    setBusy(false)
    if (!result.ok) {
      setStatus((s) => ({ ...s, error: result.error }))
    }
  }

  async function handleStop() {
    setBusy(true)
    await window.twoYou.stopStream()
    setBusy(false)
  }

  async function handlePickFile(
    sourceId: string,
    kind: 'image' | 'media' | 'slideshow',
  ) {
    const paths = await window.twoYou.openFileDialog(kind)
    if (!paths?.length) return
    updateActiveScene((scene) => ({
      ...scene,
      sources: scene.sources.map((s) => {
        if (s.id !== sourceId) return s
        if (kind === 'slideshow') {
          return {
            ...s,
            name: `${paths.length} Bilder`,
            settings: { ...s.settings, filePaths: paths },
          }
        }
        const fileName = paths[0].split(/[/\\]/).pop() || s.name
        return {
          ...s,
          name: fileName,
          settings: { ...s.settings, filePath: paths[0] },
        }
      }),
    }))
  }

  if (!ready) {
    return (
      <div className="app-shell" style={{ placeItems: 'center', display: 'grid' }}>
        <div>2you Streaming wird geladen…</div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-icon" src={appIcon} alt="" width={28} height={28} draggable={false} />
          <div className="brand-text">
            <div className="brand-mark">
              2<span>you</span> Streaming
            </div>
            <div className="brand-tag">
              Live · Twitch · YouTube · RTMP
              <span className="brand-credit"> · created by maxxxxxxxxam</span>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="ghost"
            title="Jetzt nach Updates suchen (automatisch stündlich)"
            onClick={() => setUpdateCheckRequest((n) => n + 1)}
          >
            Update prüfen
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setSettingsCategory('output')
              setSettingsOpen(true)
            }}
          >
            Einstellungen
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setSettingsCategory('appearance')
              setSettingsOpen(true)
            }}
          >
            Farben
          </button>
          <button
            type="button"
            className="ghost"
            title="Panel-Layout zurücksetzen"
            onClick={() => {
              if (layoutPersistTimer.current != null) {
                window.clearTimeout(layoutPersistTimer.current)
              }
              void persistLayout(resetUiLayout())
            }}
          >
            Layout
          </button>
          <div className={`status-pill ${status.streaming ? 'live' : ''}`}>
            <span className={`live-dot ${status.streaming ? 'on' : ''}`} />
            {status.streaming ? 'On Air' : 'Offline'}
          </div>
          <div className="window-controls" aria-label="Fenster">
            <button
              type="button"
              className="window-btn"
              title="Minimieren"
              onClick={() => void window.twoYou.minimizeWindow()}
            >
              ─
            </button>
            <button
              type="button"
              className="window-btn"
              title="Maximieren"
              onClick={() => void window.twoYou.maximizeWindow()}
            >
              □
            </button>
            <button
              type="button"
              className="window-btn window-btn-close"
              title="Schließen"
              onClick={() => void window.twoYou.closeWindow()}
            >
              ×
            </button>
          </div>
        </div>
      </header>

      {pickBanner && (
        <div className="pick-banner" role="status">
          {pickBanner}
        </div>
      )}

      {updateToast && (
        <div className="update-toast" role="status">
          {updateToast}
        </div>
      )}

      <UpdateBanner
        checkRequest={updateCheckRequest}
        onManualChecked={handleUpdateChecked}
      />

      <FlexibleWorkspace
        layout={normalizeUiLayout(config.layout)}
        onChange={(layout) => schedulePersistLayout(layout)}
        renderPanel={(id) => {
          if (id === 'scenes') {
            return (
              <ScenesPanel
                embedded
                scenes={config.scenes}
                activeSceneId={config.activeSceneId}
                onSelect={(sid) => void persistScenes(config.scenes, sid)}
                onAdd={() => {
                  const scene: Scene = {
                    id: crypto.randomUUID(),
                    name: `Szene ${config.scenes.length + 1}`,
                    sources: [createSource('display')],
                  }
                  void persistScenes([...config.scenes, scene], scene.id)
                }}
                onRename={(sid, name) => {
                  const scenes = config.scenes.map((s) =>
                    s.id === sid ? { ...s, name } : s,
                  )
                  void persistScenes(scenes, config.activeSceneId)
                }}
                onRemove={(sid) => {
                  if (config.scenes.length <= 1) return
                  const scenes = config.scenes.filter((s) => s.id !== sid)
                  const activeSceneId =
                    config.activeSceneId === sid ? scenes[0].id : config.activeSceneId
                  void persistScenes(scenes, activeSceneId)
                }}
              />
            )
          }
          if (id === 'sources') {
            return (
              <SourcesPanel
                embedded
                scene={activeScene}
                scenes={config.scenes}
                displays={displays}
                windows={windows}
                cameras={cameras}
                mics={mics}
                speakers={speakers}
                selectedSourceId={selectedSourceId}
                onSelectSource={setSelectedSourceId}
                onToggle={(sourceId) =>
                  updateActiveScene((scene) => ({
                    ...scene,
                    sources: scene.sources.map((s) =>
                      s.id === sourceId ? { ...s, enabled: !s.enabled } : s,
                    ),
                  }))
                }
                onUpdateSource={(sourceId, patch) =>
                  updateActiveScene((scene) => ({
                    ...scene,
                    sources: scene.sources.map((s) =>
                      s.id === sourceId ? { ...s, ...patch } : s,
                    ),
                  }))
                }
                onAddSource={(type) => {
                  if (isAudioSource(type)) return
                  const source: StreamSource = createSource(type)
                  setSelectedSourceId(source.id)
                  updateActiveScene((scene) => ({
                    ...scene,
                    sources: [
                      ...scene.sources.filter((s) => isVisualSource(s.type)),
                      source,
                    ],
                  }))
                }}
                onRemoveSource={(sourceId) => {
                  if (selectedSourceId === sourceId) setSelectedSourceId(null)
                  updateActiveScene((scene) => ({
                    ...scene,
                    sources: scene.sources.filter((s) => s.id !== sourceId),
                  }))
                }}
                onMove={(sourceId, direction) =>
                  updateActiveScene((scene) => {
                    const visual = scene.sources.filter((s) =>
                      isVisualSource(s.type),
                    )
                    const idx = visual.findIndex((s) => s.id === sourceId)
                    const next = idx + direction
                    if (idx < 0 || next < 0 || next >= visual.length) return scene
                    const reordered = [...visual]
                    const [item] = reordered.splice(idx, 1)
                    reordered.splice(next, 0, item)
                    return { ...scene, sources: reordered }
                  })
                }
                onPickFile={(sourceId, kind) => void handlePickFile(sourceId, kind)}
                onPickWindowCapture={(kind) => void handlePickWindowCapture(kind)}
              />
            )
          }
          if (id === 'audio') {
            return (
              <AudioSourcesPanel
                embedded
                audioSources={config.audioSources ?? []}
                windows={windows}
                mics={mics}
                selectedId={selectedAudioId}
                onSelect={setSelectedAudioId}
                onChange={(audioSources) => {
                  setConfig((c) => ({ ...c, audioSources }))
                  void persistAudioSources(audioSources)
                }}
              />
            )
          }
          if (id === 'preview') {
            return (
              <PreviewPanel
                embedded
                scene={activeScene}
                streaming={status.streaming}
                transition={config.settings.transition}
                alerts={config.settings.alerts}
                selectedSourceId={selectedSourceId}
                onSelectSource={setSelectedSourceId}
                onUpdateTransform={updateTransformLocal}
                onDropImages={(images) => {
                  if (!activeScene || images.length === 0) return
                  const sources = images.map((img) => {
                    const source = createSource('image', img.name)
                    return {
                      ...source,
                      settings: { ...source.settings, filePath: img.filePath },
                      transform: {
                        xPercent: img.xPercent,
                        yPercent: img.yPercent,
                        widthPercent: img.widthPercent,
                        heightPercent: img.heightPercent,
                      },
                    }
                  })
                  setSelectedSourceId(sources[sources.length - 1].id)
                  updateActiveScene((scene) => ({
                    ...scene,
                    sources: [...scene.sources, ...sources],
                  }))
                }}
              />
            )
          }
          if (id === 'stream') {
            return (
              <StreamPanel
                embedded
                settings={config.settings}
                status={status}
                busy={busy}
                availableEncoders={availableEncoders}
                onChange={(settings) => {
                  const prev = config.settings
                  setConfig((c) => ({ ...c, settings }))
                  void persistSettings(settings)
                  if (
                    status.streaming &&
                    activeScene &&
                    settings.streamDelayEnabled &&
                    settings.streamDelaySeconds !== prev.streamDelaySeconds
                  ) {
                    setBusy(true)
                    const displaySource = activeScene.sources.find(
                      (s) => s.type === 'display' && s.enabled,
                    )
                    const displayIndex = displaySource?.deviceId
                      ? Number(displaySource.deviceId)
                      : 0
                    void window.twoYou
                      .restartStream({
                        settings,
                        scene: activeScene,
                        audioSources: config.audioSources ?? [],
                        displayIndex,
                      })
                      .then((result) => {
                        setBusy(false)
                        if (!result.ok) {
                          setStatus((s) => ({ ...s, error: result.error }))
                        }
                      })
                  }
                }}
                onStart={() => void handleStart()}
                onStop={() => void handleStop()}
                onToggleDelay={() => void handleToggleDelay()}
                onOpenSettings={(tab = 'encoder') => {
                  setSettingsCategory(mapTabToCategory(tab))
                  setSettingsOpen(true)
                }}
              />
            )
          }
          return (
            <ChatPanel
              embedded
              channelName={config.settings.channelName}
              onChannelChange={(channelName) => {
                const settings = { ...config.settings, channelName }
                setConfig((c) => ({ ...c, settings }))
                void persistSettings(settings)
              }}
            />
          )
        }}
      />

      <SettingsModal
        open={settingsOpen}
        settings={config.settings}
        theme={config.theme ?? defaultTheme()}
        availableEncoders={availableEncoders}
        streaming={status.streaming}
        ffmpegPath={ffmpegPath}
        initialCategory={settingsCategory}
        onClose={() => setSettingsOpen(false)}
        onApply={({ settings, theme }) => {
          setConfig((c) => ({ ...c, settings, theme }))
          applyTheme(theme)
          void persistSettings(settings)
          void persistTheme(theme)
        }}
        onAddPluginSource={({ name, url }) => {
          if (!activeScene) return
          const source = createSource('browser', name)
          source.settings = {
            ...source.settings,
            url,
            width: 1920,
            height: 1080,
            fps: 30,
          }
          updateActiveScene((scene) => ({
            ...scene,
            sources: [...scene.sources, source],
          }))
        }}
      />
    </div>
  )
}
