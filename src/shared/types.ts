export type PlatformId = 'twitch' | 'youtube' | 'custom'

/** OBS-ähnliche Quellenarten */
export type SourceType =
  | 'display'
  | 'window'
  | 'game'
  | 'webcam'
  | 'microphone'
  | 'desktop_audio'
  | 'app_audio'
  | 'browser'
  | 'image'
  | 'slideshow'
  | 'media'
  | 'text'
  | 'color'
  | 'scene'

export interface SourceSettings {
  /** Browser URL */
  url?: string
  width?: number
  height?: number
  fps?: number
  /** Image / media / slideshow file paths */
  filePath?: string
  filePaths?: string[]
  /** Text source */
  text?: string
  fontSize?: number
  fontColor?: string
  /** Color source (#RRGGBB) */
  color?: string
  /** Nested scene id */
  sceneId?: string
  /** Media: loop / restart */
  loop?: boolean
  /** Game capture: capture cursor */
  captureCursor?: boolean
  /** Window/game title hint for FFmpeg */
  windowTitle?: string
  /** Audio-Lautstärke 0–100 (Mikrofon / Desktop / App) */
  volume?: number
  /** Windows-Prozess-ID für Anwendungsaudio (WASAPI process loopback) */
  processId?: number
  /** Prozessname (z. B. Spotify) — alle PIDs dieses Namens werden erfasst */
  processName?: string
}

/** Position & Größe einer Quelle auf der Szenen-Fläche (0–100 %) */
export interface SourceTransform {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

export interface StreamSource {
  id: string
  name: string
  type: SourceType
  enabled: boolean
  /** Display index, device id, window capturer id, etc. */
  deviceId?: string
  deviceLabel?: string
  settings?: SourceSettings
  /** Layout auf der Preview-/Stream-Fläche */
  transform?: SourceTransform
}

export interface Scene {
  id: string
  name: string
  sources: StreamSource[]
}

export const VISUAL_SOURCE_TYPES: SourceType[] = [
  'display',
  'window',
  'game',
  'webcam',
  'browser',
  'image',
  'slideshow',
  'media',
  'text',
  'color',
  'scene',
]

export function isVisualSource(type: SourceType): boolean {
  return VISUAL_SOURCE_TYPES.includes(type)
}

export const AUDIO_SOURCE_TYPES: SourceType[] = [
  'microphone',
  'desktop_audio',
  'app_audio',
]

export function isAudioSource(type: SourceType): boolean {
  return (AUDIO_SOURCE_TYPES as SourceType[]).includes(type)
}

export function defaultTransformForType(type: SourceType): SourceTransform {
  switch (type) {
    case 'image':
    case 'slideshow':
      return { xPercent: 68, yPercent: 6, widthPercent: 28, heightPercent: 28 }
    case 'webcam':
      return { xPercent: 72, yPercent: 68, widthPercent: 24, heightPercent: 24 }
    case 'text':
      return { xPercent: 10, yPercent: 78, widthPercent: 80, heightPercent: 16 }
    case 'browser':
      return { xPercent: 5, yPercent: 5, widthPercent: 40, heightPercent: 40 }
    default:
      return { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100 }
  }
}

export function normalizeTransform(
  raw?: Partial<SourceTransform> | null,
  type: SourceType = 'display',
): SourceTransform {
  const fallback = defaultTransformForType(type)
  const t = { ...fallback, ...(raw ?? {}) }
  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Number.isFinite(v) ? v : min))
  return {
    xPercent: clamp(t.xPercent, -20, 100),
    yPercent: clamp(t.yPercent, -20, 100),
    widthPercent: clamp(t.widthPercent, 5, 100),
    heightPercent: clamp(t.heightPercent, 5, 100),
  }
}

export function withSourceTransform(source: StreamSource): StreamSource {
  return {
    ...source,
    transform: normalizeTransform(source.transform, source.type),
    settings: source.settings ?? {},
  }
}

export type VideoEncoderId = 'x264' | 'nvenc' | 'amf' | 'qsv'

export type OutputMode = 'simple' | 'advanced'
export type RateControlId = 'cbr' | 'vbr' | 'crf'
export type H264Profile = 'baseline' | 'main' | 'high'
export type AudioSampleRate = 44100 | 48000

export interface VideoEncoderInfo {
  id: VideoEncoderId
  label: string
  description: string
  ffmpegCodec: string
  presets: { id: string; label: string }[]
  defaultPreset: string
}

export const VIDEO_ENCODERS: VideoEncoderInfo[] = [
  {
    id: 'x264',
    label: 'x264 (Software)',
    description: 'CPU – kompatibel überall, höherer CPU-Last',
    ffmpegCodec: 'libx264',
    defaultPreset: 'veryfast',
    presets: [
      { id: 'ultrafast', label: 'ultrafast' },
      { id: 'superfast', label: 'superfast' },
      { id: 'veryfast', label: 'veryfast' },
      { id: 'faster', label: 'faster' },
      { id: 'fast', label: 'fast' },
      { id: 'medium', label: 'medium' },
      { id: 'slow', label: 'slow' },
    ],
  },
  {
    id: 'nvenc',
    label: 'NVIDIA NVENC',
    description: 'NVIDIA-GPU – niedrigere CPU-Last',
    ffmpegCodec: 'h264_nvenc',
    defaultPreset: 'p4',
    presets: [
      { id: 'p1', label: 'P1 (schnellste)' },
      { id: 'p2', label: 'P2' },
      { id: 'p3', label: 'P3' },
      { id: 'p4', label: 'P4 (empfohlen)' },
      { id: 'p5', label: 'P5' },
      { id: 'p6', label: 'P6' },
      { id: 'p7', label: 'P7 (beste Qualität)' },
    ],
  },
  {
    id: 'amf',
    label: 'AMD AMF',
    description: 'AMD-GPU – Hardware-Encoding',
    ffmpegCodec: 'h264_amf',
    defaultPreset: 'speed',
    presets: [
      { id: 'speed', label: 'Speed' },
      { id: 'balanced', label: 'Balanced' },
      { id: 'quality', label: 'Quality' },
    ],
  },
  {
    id: 'qsv',
    label: 'Intel Quick Sync',
    description: 'Intel-GPU – Hardware-Encoding',
    ffmpegCodec: 'h264_qsv',
    defaultPreset: 'veryfast',
    presets: [
      { id: 'veryfast', label: 'veryfast' },
      { id: 'faster', label: 'faster' },
      { id: 'fast', label: 'fast' },
      { id: 'medium', label: 'medium' },
    ],
  },
]

export function getEncoderInfo(id: VideoEncoderId): VideoEncoderInfo {
  return VIDEO_ENCODERS.find((e) => e.id === id) ?? VIDEO_ENCODERS[0]
}

export const OUTPUT_RESOLUTIONS = [
  '2560x1440',
  '1920x1080',
  '1600x900',
  '1280x720',
  '854x480',
] as const

export const OUTPUT_FPS_OPTIONS = [24, 25, 30, 48, 50, 60] as const

export interface EncoderSettings {
  videoEncoder: VideoEncoderId
  /** Encoder-spezifisches Preset (z. B. veryfast, p4, speed) */
  preset: string
  /** z. B. 1920x1080 — auch eigene Werte erlaubt */
  resolution: string
  fps: number
  videoBitrate: number
  audioBitrate: number
  /** Einfach = wenige Felder, Fortgeschritten = volle Kontrolle */
  outputMode: OutputMode
  rateControl: RateControlId
  /** Qualität 0–51 (niedriger = besser), bei CRF */
  crf: number
  /** Keyframe-Intervall in Sekunden */
  keyframeIntervalSec: number
  profile: H264Profile
  bframes: number
  /** VBV-Puffer als Vielfaches der Bitrate */
  bufsizeMultiplier: number
  /** Encoder-Tune: auto | none | zerolatency | ll | hq */
  tune: string
  audioSampleRate: AudioSampleRate
  audioChannels: 1 | 2
}

export function defaultEncoderSettings(): EncoderSettings {
  return {
    videoEncoder: 'x264',
    preset: 'veryfast',
    resolution: '1920x1080',
    fps: 30,
    videoBitrate: 4500,
    audioBitrate: 160,
    outputMode: 'simple',
    rateControl: 'cbr',
    crf: 23,
    keyframeIntervalSec: 2,
    profile: 'high',
    bframes: 2,
    bufsizeMultiplier: 2,
    tune: 'auto',
    audioSampleRate: 48000,
    audioChannels: 2,
  }
}

export function normalizeEncoderSettings(
  raw?: Partial<EncoderSettings> | null,
): EncoderSettings {
  const d = defaultEncoderSettings()
  const e = { ...d, ...(raw ?? {}) }
  const fps = Number(e.fps)
  const keySec = Number(e.keyframeIntervalSec)
  const crf = Number(e.crf)
  const bframes = Number(e.bframes)
  const bufMul = Number(e.bufsizeMultiplier)
  const res =
    typeof e.resolution === 'string' && /^\d{2,5}x\d{2,5}$/.test(e.resolution)
      ? e.resolution
      : d.resolution

  return {
    videoEncoder: (['x264', 'nvenc', 'amf', 'qsv'] as VideoEncoderId[]).includes(
      e.videoEncoder as VideoEncoderId,
    )
      ? (e.videoEncoder as VideoEncoderId)
      : d.videoEncoder,
    preset: String(e.preset || d.preset),
    resolution: res,
    fps: Number.isFinite(fps) && fps >= 1 && fps <= 120 ? Math.round(fps) : d.fps,
    videoBitrate: Math.max(200, Math.min(50000, Number(e.videoBitrate) || d.videoBitrate)),
    audioBitrate: Math.max(32, Math.min(512, Number(e.audioBitrate) || d.audioBitrate)),
    outputMode: e.outputMode === 'advanced' ? 'advanced' : 'simple',
    rateControl:
      e.rateControl === 'vbr' || e.rateControl === 'crf' ? e.rateControl : 'cbr',
    crf: Number.isFinite(crf) ? Math.max(0, Math.min(51, Math.round(crf))) : d.crf,
    keyframeIntervalSec: Number.isFinite(keySec)
      ? Math.max(0.5, Math.min(10, keySec))
      : d.keyframeIntervalSec,
    profile:
      e.profile === 'baseline' || e.profile === 'main' || e.profile === 'high'
        ? e.profile
        : d.profile,
    bframes: Number.isFinite(bframes)
      ? Math.max(0, Math.min(16, Math.round(bframes)))
      : d.bframes,
    bufsizeMultiplier: Number.isFinite(bufMul)
      ? Math.max(0.5, Math.min(8, bufMul))
      : d.bufsizeMultiplier,
    tune: String(e.tune || d.tune),
    audioSampleRate: e.audioSampleRate === 44100 ? 44100 : 48000,
    audioChannels: e.audioChannels === 1 ? 1 : 2,
  }
}

export interface StreamSettings {
  platform: PlatformId
  streamKey: string
  customRtmpUrl: string
  /** Twitch-Kanalname für Live-Chat */
  channelName: string
  /**
   * Öffentliche URL zum Update-Feed (JSON).
   * Leer = eingebauter GitHub-Default, sonst lokaler Dev-Feed.
   */
  updateFeedUrl: string
  /** Szenenübergang */
  transition: TransitionSettings
  /** Lokale Alerts (ohne Internet) */
  alerts: AlertsSettings
  encoder: EncoderSettings
}

export type AlertTypeId = 'follow' | 'subscribe' | 'donation' | 'raid' | 'custom'

export type AlertAnimation = 'slide' | 'fade' | 'bounce'

export interface AlertTextLayout {
  visible: boolean
  /** Position im Alert-Rahmen (0–100 %) */
  xPercent: number
  yPercent: number
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  maxWidthPercent: number
  bold: boolean
}

export interface AlertMediaLayout {
  /** none | image | video */
  kind: 'none' | 'image' | 'video'
  filePath: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  fit: 'contain' | 'cover'
  loop: boolean
  muted: boolean
}

export interface AlertTypeConfig {
  enabled: boolean
  label: string
  titleTemplate: string
  subtitleTemplate: string
  durationMs: number
  animation: AlertAnimation
  /** Gesamter Alert auf der Vorschau */
  boxXPercent: number
  boxYPercent: number
  boxWidthPercent: number
  boxHeightPercent: number
  showBackground: boolean
  bgColor: string
  accentColor: string
  soundEnabled: boolean
  media: AlertMediaLayout
  titleLayout: AlertTextLayout
  subtitleLayout: AlertTextLayout
}

export interface AlertsSettings {
  enabled: boolean
  volume: number
  types: Record<AlertTypeId, AlertTypeConfig>
}

export interface AlertPayload {
  type: AlertTypeId
  name?: string
  amount?: string
  months?: string
  viewers?: string
  message?: string
}

export const ALERT_TYPE_ORDER: AlertTypeId[] = [
  'follow',
  'subscribe',
  'donation',
  'raid',
  'custom',
]

function defaultTitleLayout(color = '#ffffff'): AlertTextLayout {
  return {
    visible: true,
    xPercent: 50,
    yPercent: 58,
    fontSize: 28,
    color,
    align: 'center',
    maxWidthPercent: 90,
    bold: true,
  }
}

function defaultSubtitleLayout(color = '#ffffff'): AlertTextLayout {
  return {
    visible: true,
    xPercent: 50,
    yPercent: 78,
    fontSize: 16,
    color,
    align: 'center',
    maxWidthPercent: 90,
    bold: false,
  }
}

function defaultMedia(): AlertMediaLayout {
  return {
    kind: 'none',
    filePath: '',
    xPercent: 50,
    yPercent: 28,
    widthPercent: 40,
    heightPercent: 40,
    fit: 'contain',
    loop: true,
    muted: true,
  }
}

function makeAlertType(
  partial: Partial<AlertTypeConfig> & Pick<AlertTypeConfig, 'label' | 'titleTemplate' | 'subtitleTemplate' | 'accentColor'>,
): AlertTypeConfig {
  return {
    enabled: true,
    durationMs: 5000,
    animation: 'slide',
    boxXPercent: 50,
    boxYPercent: 12,
    boxWidthPercent: 42,
    boxHeightPercent: 38,
    showBackground: true,
    bgColor: '#0f1620cc',
    soundEnabled: true,
    media: defaultMedia(),
    titleLayout: defaultTitleLayout(),
    subtitleLayout: defaultSubtitleLayout(),
    ...partial,
  }
}

export function defaultAlerts(): AlertsSettings {
  return {
    enabled: true,
    volume: 60,
    types: {
      follow: makeAlertType({
        label: 'Follower',
        titleTemplate: 'Neuer Follower!',
        subtitleTemplate: '{name} folgt jetzt',
        accentColor: '#2ec4b6',
        animation: 'slide',
      }),
      subscribe: makeAlertType({
        label: 'Abo',
        titleTemplate: 'Neues Abo!',
        subtitleTemplate: '{name} · {months} Monat(e)',
        accentColor: '#5b8def',
        animation: 'bounce',
        bgColor: '#12182acc',
      }),
      donation: makeAlertType({
        label: 'Spende',
        titleTemplate: '{amount} Spende!',
        subtitleTemplate: '{name}: {message}',
        accentColor: '#f0b429',
        animation: 'bounce',
        boxYPercent: 35,
        bgColor: '#1a160ecc',
      }),
      raid: makeAlertType({
        label: 'Raid',
        titleTemplate: 'Raid!',
        subtitleTemplate: '{name} mit {viewers} Zuschauern',
        accentColor: '#3dd68c',
        bgColor: '#0f1a14cc',
      }),
      custom: makeAlertType({
        label: 'Custom',
        titleTemplate: '{name}',
        subtitleTemplate: '{message}',
        accentColor: '#2ec4b6',
        soundEnabled: false,
        boxYPercent: 70,
        bgColor: '#0f1620cc',
        animation: 'fade',
      }),
    },
  }
}

/** Alte Alert-Configs auf neues Layout bringen */
export function normalizeAlertType(
  raw: Partial<AlertTypeConfig> & { position?: string; textColor?: string },
  fallback: AlertTypeConfig,
): AlertTypeConfig {
  const base = { ...fallback, ...raw }
  const legacyPos = raw.position
  let boxY = base.boxYPercent ?? fallback.boxYPercent
  if (legacyPos === 'top') boxY = 12
  if (legacyPos === 'center') boxY = 35
  if (legacyPos === 'bottom') boxY = 70

  const textColor = raw.textColor || raw.titleLayout?.color || fallback.titleLayout.color

  return {
    ...fallback,
    ...base,
    boxXPercent: base.boxXPercent ?? 50,
    boxYPercent: boxY,
    boxWidthPercent: base.boxWidthPercent ?? 42,
    boxHeightPercent: base.boxHeightPercent ?? 38,
    showBackground: base.showBackground ?? true,
    media: { ...defaultMedia(), ...(raw.media ?? {}) },
    titleLayout: {
      ...defaultTitleLayout(textColor),
      ...(raw.titleLayout ?? {}),
      color: raw.titleLayout?.color || textColor,
    },
    subtitleLayout: {
      ...defaultSubtitleLayout(textColor),
      ...(raw.subtitleLayout ?? {}),
      color: raw.subtitleLayout?.color || textColor,
    },
  }
}

export function normalizeAlerts(
  raw?: Partial<AlertsSettings> | null,
): AlertsSettings {
  const defaults = defaultAlerts()
  if (!raw) return defaults
  const types = {} as Record<AlertTypeId, AlertTypeConfig>
  for (const id of ALERT_TYPE_ORDER) {
    types[id] = normalizeAlertType(
      (raw.types?.[id] ?? {}) as Partial<AlertTypeConfig> & {
        position?: string
        textColor?: string
      },
      defaults.types[id],
    )
  }
  return {
    enabled: raw.enabled ?? defaults.enabled,
    volume: raw.volume ?? defaults.volume,
    types,
  }
}

export function renderAlertTemplate(
  template: string,
  payload: AlertPayload,
): string {
  return template
    .replaceAll('{name}', payload.name ?? 'Jemand')
    .replaceAll('{amount}', payload.amount ?? '5€')
    .replaceAll('{months}', payload.months ?? '1')
    .replaceAll('{viewers}', payload.viewers ?? '10')
    .replaceAll('{message}', payload.message ?? '')
}

export function toFileUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('file:')) return path
  return `file:///${path.replace(/\\/g, '/')}`
}

export type TransitionId =
  | 'cut'
  | 'fade'
  | 'fade_black'
  | 'slide_left'
  | 'slide_right'
  | 'slide_up'
  | 'slide_down'
  | 'wipe_left'
  | 'wipe_right'
  | 'zoom'
  | 'blur'
  | 'stinger'

export interface TransitionSettings {
  type: TransitionId
  durationMs: number
}

export const TRANSITION_PRESETS: {
  id: TransitionId
  label: string
  description: string
}[] = [
  { id: 'cut', label: 'Schnitt', description: 'Sofortiger Wechsel' },
  { id: 'fade', label: 'Überblenden', description: 'Weiches Ein-/Ausblenden' },
  { id: 'fade_black', label: 'Schwarz überblenden', description: 'Über Schwarz' },
  { id: 'slide_left', label: 'Schieben links', description: 'Neue Szene von rechts' },
  { id: 'slide_right', label: 'Schieben rechts', description: 'Neue Szene von links' },
  { id: 'slide_up', label: 'Schieben oben', description: 'Neue Szene von unten' },
  { id: 'slide_down', label: 'Schieben unten', description: 'Neue Szene von oben' },
  { id: 'wipe_left', label: 'Wischen links', description: 'Wisch-Übergang' },
  { id: 'wipe_right', label: 'Wischen rechts', description: 'Wisch-Übergang' },
  { id: 'zoom', label: 'Zoom', description: 'Heraus-/Hineinzoomen' },
  { id: 'blur', label: 'Unschärfe', description: 'Über Weichzeichner' },
  { id: 'stinger', label: 'Stinger', description: 'Schneller Flash-Zoom' },
]

export function defaultTransition(): TransitionSettings {
  return { type: 'fade', durationMs: 500 }
}

export interface ThemeColors {
  bg: string
  bgPanel: string
  bgElevated: string
  bgHover: string
  border: string
  text: string
  textMuted: string
  accent: string
  accentStrong: string
  danger: string
  dangerStrong: string
  live: string
  ok: string
}

export const THEME_COLOR_FIELDS: {
  key: keyof ThemeColors
  label: string
  group: 'flächen' | 'text' | 'akzente'
}[] = [
  { key: 'bg', label: 'Hintergrund', group: 'flächen' },
  { key: 'bgPanel', label: 'Panel', group: 'flächen' },
  { key: 'bgElevated', label: 'Erhöht', group: 'flächen' },
  { key: 'bgHover', label: 'Hover', group: 'flächen' },
  { key: 'border', label: 'Rahmen', group: 'flächen' },
  { key: 'text', label: 'Text', group: 'text' },
  { key: 'textMuted', label: 'Text gedämpft', group: 'text' },
  { key: 'accent', label: 'Akzent', group: 'akzente' },
  { key: 'accentStrong', label: 'Akzent stark', group: 'akzente' },
  { key: 'danger', label: 'Gefahr', group: 'akzente' },
  { key: 'dangerStrong', label: 'Gefahr stark', group: 'akzente' },
  { key: 'live', label: 'Live', group: 'akzente' },
  { key: 'ok', label: 'OK / Aktiv', group: 'akzente' },
]

export function defaultTheme(): ThemeColors {
  return {
    bg: '#0a0f14',
    bgPanel: '#111820',
    bgElevated: '#18222d',
    bgHover: '#223040',
    border: '#2c3c4c',
    text: '#eef3f7',
    textMuted: '#8a9aab',
    accent: '#2ec4b6',
    accentStrong: '#1fa89c',
    danger: '#f07178',
    dangerStrong: '#d94c56',
    live: '#ff4d5e',
    ok: '#3dd68c',
  }
}

export const THEME_PRESETS: { id: string; label: string; colors: ThemeColors }[] = [
  { id: 'midnight', label: 'Studio', colors: defaultTheme() },
  {
    id: 'twitch',
    label: 'Twitch Violet',
    colors: {
      bg: '#0e0b14',
      bgPanel: '#181222',
      bgElevated: '#241b33',
      bgHover: '#2f2342',
      border: '#3d2f55',
      text: '#f3eefc',
      textMuted: '#a894c4',
      accent: '#9146ff',
      accentStrong: '#772ce8',
      danger: '#e85d5d',
      dangerStrong: '#c94444',
      live: '#eb0400',
      ok: '#00f593',
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    colors: {
      bg: '#140e0c',
      bgPanel: '#1c1410',
      bgElevated: '#2a1c16',
      bgHover: '#3a2820',
      border: '#4a342a',
      text: '#f7efe8',
      textMuted: '#b89a88',
      accent: '#ff7a3d',
      accentStrong: '#e85d20',
      danger: '#ff5c5c',
      dangerStrong: '#d94444',
      live: '#ff3b30',
      ok: '#f0c040',
    },
  },
  {
    id: 'forest',
    label: 'Forest',
    colors: {
      bg: '#0b1210',
      bgPanel: '#121a17',
      bgElevated: '#1a2621',
      bgHover: '#24332c',
      border: '#2f433a',
      text: '#e8f5ef',
      textMuted: '#8fafa0',
      accent: '#3ecf8e',
      accentStrong: '#2aad72',
      danger: '#e85d5d',
      dangerStrong: '#c94444',
      live: '#e23d3d',
      ok: '#5eead4',
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    colors: {
      bg: '#071018',
      bgPanel: '#0d1a24',
      bgElevated: '#132433',
      bgHover: '#1b3144',
      border: '#274058',
      text: '#e6f4ff',
      textMuted: '#7ea8c4',
      accent: '#22d3ee',
      accentStrong: '#0891b2',
      danger: '#f87171',
      dangerStrong: '#dc2626',
      live: '#fb7185',
      ok: '#34d399',
    },
  },
  {
    id: 'slate',
    label: 'Slate Light',
    colors: {
      bg: '#f1f5f9',
      bgPanel: '#ffffff',
      bgElevated: '#e2e8f0',
      bgHover: '#cbd5e1',
      border: '#94a3b8',
      text: '#0f172a',
      textMuted: '#64748b',
      accent: '#2563eb',
      accentStrong: '#1d4ed8',
      danger: '#dc2626',
      dangerStrong: '#b91c1c',
      live: '#e11d48',
      ok: '#059669',
    },
  },
]

export interface AppConfig {
  version: number
  settings: StreamSettings
  theme: ThemeColors
  scenes: Scene[]
  activeSceneId: string
  /**
   * Globale Audio-Quellen (nicht an Szenen gebunden) —
   * Mikrofon, Desktop-, Anwendungsaudio.
   */
  audioSources: StreamSource[]
  /** Frei angeordnete UI-Panels */
  layout?: UiLayout
  /**
   * Zuletzt gelaufene App-Version (package.json).
   * Beim Update werden Szenen/Quellen/Einstellungen beibehalten.
   */
  lastAppVersion?: string
}

export type PanelId = 'scenes' | 'sources' | 'audio' | 'preview' | 'stream' | 'chat'

export interface UiPanelSlot {
  id: PanelId
  /** Anteil der Spaltenhöhe 0–100 */
  heightPercent: number
}

export interface UiColumn {
  id: string
  /** Anteil der Arbeitsfläche-Breite 0–100 */
  widthPercent: number
  panels: UiPanelSlot[]
}

export interface UiLayout {
  columns: UiColumn[]
}

export const PANEL_LABELS: Record<PanelId, string> = {
  scenes: 'Szenen',
  sources: 'Video-Quellen',
  audio: 'Audio',
  preview: 'Vorschau',
  stream: 'Stream',
  chat: 'Chat',
}

export const ALL_PANEL_IDS: PanelId[] = [
  'scenes',
  'sources',
  'audio',
  'preview',
  'stream',
  'chat',
]

export function defaultUiLayout(): UiLayout {
  return {
    columns: [
      {
        id: 'col-left',
        widthPercent: 20,
        panels: [
          { id: 'scenes', heightPercent: 28 },
          { id: 'sources', heightPercent: 40 },
          { id: 'audio', heightPercent: 32 },
        ],
      },
      {
        id: 'col-center',
        widthPercent: 55,
        panels: [{ id: 'preview', heightPercent: 100 }],
      },
      {
        id: 'col-right',
        widthPercent: 25,
        panels: [
          { id: 'stream', heightPercent: 45 },
          { id: 'chat', heightPercent: 55 },
        ],
      },
    ],
  }
}

export function normalizeUiLayout(raw?: UiLayout | null): UiLayout {
  const fallback = defaultUiLayout()
  if (!raw?.columns?.length) return fallback

  const seen = new Set<PanelId>()
  const columns: UiColumn[] = []

  for (const col of raw.columns) {
    const panels = (col.panels ?? [])
      .filter((p) => ALL_PANEL_IDS.includes(p.id) && !seen.has(p.id))
      .map((p) => {
        seen.add(p.id)
        return {
          id: p.id,
          heightPercent: Math.max(12, Math.min(100, p.heightPercent || 50)),
        }
      })
    if (panels.length === 0) continue
    // normalize heights to 100
    const sum = panels.reduce((a, p) => a + p.heightPercent, 0) || 1
    const normalized = panels.map((p) => ({
      ...p,
      heightPercent: (p.heightPercent / sum) * 100,
    }))
    columns.push({
      id: col.id || `col-${columns.length}`,
      widthPercent: Math.max(12, Math.min(70, col.widthPercent || 30)),
      panels: normalized,
    })
  }

  // Append missing panels into last column
  const missing = ALL_PANEL_IDS.filter((id) => !seen.has(id))
  if (missing.length > 0) {
    if (columns.length === 0) return fallback
    const last = columns[columns.length - 1]
    const extraShare = 100 / (last.panels.length + missing.length)
    last.panels = [
      ...last.panels.map((p) => ({
        ...p,
        heightPercent: (p.heightPercent / 100) * (100 - extraShare * missing.length),
      })),
      ...missing.map((id) => ({ id, heightPercent: extraShare })),
    ]
  }

  if (columns.length === 0) return fallback

  const widthSum = columns.reduce((a, c) => a + c.widthPercent, 0) || 1
  return {
    columns: columns.map((c) => ({
      ...c,
      widthPercent: (c.widthPercent / widthSum) * 100,
    })),
  }
}

export interface DisplayInfo {
  id: string
  name: string
  index: number
  width: number
  height: number
}

export interface WindowInfo {
  id: string
  name: string
  /** Windows PID (für Anwendungsaudio) */
  processId?: number
  processName?: string
}

export interface MediaDeviceInfoLite {
  deviceId: string
  label: string
  kind: 'videoinput' | 'audioinput' | 'audiooutput'
}

export interface StreamStatus {
  streaming: boolean
  startedAt: number | null
  bitrateKbps: number | null
  fps: number | null
  error: string | null
  lastLogLine: string | null
}

export interface StartStreamPayload {
  settings: StreamSettings
  scene: Scene
  /** Globale Audio-Quellen für den Mix */
  audioSources: StreamSource[]
  displayIndex: number
}

export interface ChatMessage {
  id: string
  user: string
  color: string
  text: string
  system?: boolean
  /** Twitch IRC emotes-Tag (z. B. 25:0-4) */
  emotes?: string
  /** badges-raw z. B. broadcaster/1,moderator/1,vip/1 */
  badgesRaw?: string
  /** Parsed badges map from tmi */
  badges?: Record<string, string>
  /** Twitch room-id for channel badges */
  roomId?: string
}

export type ChatConnStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface ChatStatusPayload {
  status: ChatConnStatus
  channel: string
  error: string | null
}

export interface SourceTypeInfo {
  type: SourceType
  label: string
  description: string
  category: 'video' | 'audio' | 'media' | 'other'
}

/** Entspricht den Standard-Quellen in OBS Studio (Windows) */
export const OBS_SOURCE_TYPES: SourceTypeInfo[] = [
  {
    type: 'display',
    label: 'Bildschirmaufnahme',
    description: 'Gesamten Monitor erfassen',
    category: 'video',
  },
  {
    type: 'window',
    label: 'Fensteraufnahme',
    description: 'Einzelnes Fenster erfassen',
    category: 'video',
  },
  {
    type: 'game',
    label: 'Spielaufnahme',
    description: 'Spiel / Vollbild-App erfassen',
    category: 'video',
  },
  {
    type: 'webcam',
    label: 'Videoaufnahmegerät',
    description: 'Webcam oder Capture-Card',
    category: 'video',
  },
  {
    type: 'microphone',
    label: 'Audio-Eingabeaufnahme',
    description: 'Mikrofon / Eingabegerät',
    category: 'audio',
  },
  {
    type: 'desktop_audio',
    label: 'Desktop-Audio',
    description: 'Was der PC wiedergibt (System-Loopback)',
    category: 'audio',
  },
  {
    type: 'app_audio',
    label: 'Anwendungsaudioaufnahme',
    description: 'Ton einer einzelnen App / eines Fensters',
    category: 'audio',
  },
  {
    type: 'browser',
    label: 'Browserquelle',
    description: 'Webseite / Overlay per URL',
    category: 'media',
  },
  {
    type: 'image',
    label: 'Bild',
    description: 'PNG, JPG, WebP, …',
    category: 'media',
  },
  {
    type: 'slideshow',
    label: 'Bilddiashow',
    description: 'Mehrere Bilder abwechselnd',
    category: 'media',
  },
  {
    type: 'media',
    label: 'Medienquelle',
    description: 'Video- oder Audiodatei',
    category: 'media',
  },
  {
    type: 'text',
    label: 'Text (GDI+)',
    description: 'Statischer oder dynamischer Text',
    category: 'other',
  },
  {
    type: 'color',
    label: 'Farbquelle',
    description: 'Einfarbige Fläche',
    category: 'other',
  },
  {
    type: 'scene',
    label: 'Szene',
    description: 'Andere Szene als Quelle einbetten',
    category: 'other',
  },
]

export function sourceLabel(type: SourceType): string {
  return OBS_SOURCE_TYPES.find((s) => s.type === type)?.label ?? type
}

export function createSource(type: SourceType, name?: string): StreamSource {
  const id = crypto.randomUUID()
  const base: StreamSource = {
    id,
    name: name || sourceLabel(type),
    type,
    enabled: true,
    settings: {},
    transform: defaultTransformForType(type),
  }

  switch (type) {
    case 'display':
      return { ...base, deviceId: '0', deviceLabel: 'Monitor 1' }
    case 'browser':
      return {
        ...base,
        settings: {
          url: 'https://',
          width: 1920,
          height: 1080,
          fps: 30,
        },
      }
    case 'text':
      return {
        ...base,
        settings: {
          text: '2you Streaming',
          fontSize: 48,
          fontColor: '#ffffff',
        },
      }
    case 'color':
      return {
        ...base,
        settings: { color: '#1a2332', width: 1920, height: 1080 },
      }
    case 'media':
      return { ...base, settings: { loop: true } }
    case 'slideshow':
      return { ...base, settings: { filePaths: [], fps: 1 } }
    case 'game':
      return { ...base, settings: { captureCursor: true } }
    case 'image':
    case 'window':
    case 'webcam':
      return base
    case 'microphone':
    case 'desktop_audio':
    case 'app_audio':
      return { ...base, settings: { volume: 100 } }
    case 'scene':
    default:
      return base
  }
}

export const PLATFORM_PRESETS: Record<
  Exclude<PlatformId, 'custom'>,
  { label: string; rtmpUrl: string }
> = {
  twitch: {
    label: 'Twitch',
    rtmpUrl: 'rtmp://live.twitch.tv/app',
  },
  youtube: {
    label: 'YouTube',
    rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
  },
}

export function resolveRtmpUrl(settings: StreamSettings): string {
  if (settings.platform === 'custom') {
    return settings.customRtmpUrl.trim()
  }
  return PLATFORM_PRESETS[settings.platform].rtmpUrl
}

export function createDefaultConfig(): AppConfig {
  const sceneId = 'scene-main'
  return {
    version: 3,
    settings: {
      platform: 'twitch',
      streamKey: '',
      customRtmpUrl: 'rtmp://',
      channelName: '',
      updateFeedUrl: '', // leer → Electron nutzt DEFAULT_UPDATE_FEED_URL (GitHub)
      transition: defaultTransition(),
      alerts: defaultAlerts(),
      encoder: defaultEncoderSettings(),
    },
    theme: defaultTheme(),
    scenes: [
      {
        id: sceneId,
        name: 'HauptSzene',
        sources: [
          withSourceTransform({
            id: 'src-display',
            name: 'Bildschirmaufnahme',
            type: 'display',
            enabled: true,
            deviceId: '0',
            deviceLabel: 'Monitor 1',
            settings: {},
          }),
        ],
      },
    ],
    activeSceneId: sceneId,
    audioSources: [
      withSourceTransform({
        id: 'src-mic',
        name: 'Mikrofon',
        type: 'microphone',
        enabled: true,
        settings: { volume: 100 },
      }),
      withSourceTransform({
        id: 'src-desktop-audio',
        name: 'Desktop-Audio',
        type: 'desktop_audio',
        enabled: false,
        settings: { volume: 100 },
      }),
    ],
    layout: defaultUiLayout(),
  }
}
