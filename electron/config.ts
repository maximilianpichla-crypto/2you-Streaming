import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  AppConfig,
  createDefaultConfig,
  StreamSettings,
  Scene,
  ThemeColors,
  defaultTheme,
  normalizeAlerts,
  withSourceTransform,
  normalizeUiLayout,
  isAudioSource,
  isVisualSource,
  normalizeEncoderSettings,
} from '../src/shared/types'

/** Config-Schema-Version — nur erhöhen, wenn migrateConfig neue Felder braucht */
const CONFIG_SCHEMA_VERSION = 3

function userDataDir(): string {
  return app.getPath('userData')
}

export function configPath(): string {
  return path.join(userDataDir(), 'config.json')
}

function backupPath(): string {
  return path.join(userDataDir(), 'config.backup.json')
}

function preUpdateBackupPath(appVersion: string): string {
  const safe = appVersion.replace(/[^\w.-]+/g, '_')
  return path.join(userDataDir(), `config.before-${safe}.json`)
}

function readJsonFile(file: string): AppConfig | null {
  try {
    if (!fs.existsSync(file)) return null
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as AppConfig
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writeJsonFile(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

/** Aktuelle Config sichern (vor Update / vor riskanter Migration) */
export function backupUserConfig(label?: string): void {
  const current = readJsonFile(configPath())
  if (!current) return
  writeJsonFile(backupPath(), current)
  if (label) {
    try {
      writeJsonFile(preUpdateBackupPath(label), current)
    } catch {
      /* optional */
    }
  }
}

export function loadConfig(): AppConfig {
  const file = configPath()
  try {
    if (!fs.existsSync(file)) {
      const defaults = createDefaultConfig()
      defaults.lastAppVersion = app.getVersion()
      saveConfig(defaults)
      return defaults
    }
    const parsed = readJsonFile(file)
    if (!parsed) throw new Error('invalid config')
    const migrated = migrateConfig(parsed)
    // Nur speichern wenn Migration etwas geändert hat
    if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
      backupUserConfig()
      saveConfig(migrated)
    }
    return migrated
  } catch {
    const fromBackup = readJsonFile(backupPath())
    if (fromBackup) {
      const restored = migrateConfig(fromBackup)
      saveConfig(restored)
      return restored
    }
    const defaults = createDefaultConfig()
    defaults.lastAppVersion = app.getVersion()
    saveConfig(defaults)
    return defaults
  }
}

export function saveConfig(config: AppConfig): void {
  // Rolling backup der letzten gültigen Version
  const previous = readJsonFile(configPath())
  if (previous) {
    try {
      writeJsonFile(backupPath(), previous)
    } catch {
      /* ignore */
    }
  }
  writeJsonFile(configPath(), config)
}

export function updateSettings(settings: StreamSettings): AppConfig {
  const config = loadConfig()
  config.settings = settings
  saveConfig(config)
  return config
}

export function updateTheme(theme: ThemeColors): AppConfig {
  const config = loadConfig()
  config.theme = theme
  saveConfig(config)
  return config
}

export function updateScenes(scenes: Scene[], activeSceneId: string): AppConfig {
  const config = loadConfig()
  // Sicherheit: keine Audio-Quellen in Szenen speichern
  config.scenes = scenes.map((scene) => ({
    ...scene,
    sources: (scene.sources ?? []).filter((s) => isVisualSource(s.type)),
  }))
  config.activeSceneId = activeSceneId
  saveConfig(config)
  return config
}

export function updateAudioSources(
  audioSources: import('../src/shared/types').StreamSource[],
): AppConfig {
  const config = loadConfig()
  config.audioSources = audioSources.filter((s) => isAudioSource(s.type))
  saveConfig(config)
  return config
}

export function updateLayout(layout: import('../src/shared/types').UiLayout): AppConfig {
  const config = loadConfig()
  config.layout = normalizeUiLayout(layout)
  saveConfig(config)
  return config
}

/**
 * Nach App-Update: Nutzerdaten behalten, nur Schema angleichen + Backup.
 * Szenen, Quellen, Stream-Key, Theme, Layout bleiben erhalten.
 */
export function preserveConfigAcrossAppUpdate(): AppConfig {
  const appVersion = app.getVersion()
  const config = loadConfig()
  if (config.lastAppVersion === appVersion) {
    return config
  }

  backupUserConfig(config.lastAppVersion || 'unknown')
  const next = migrateConfig({
    ...config,
    lastAppVersion: appVersion,
  })
  next.lastAppVersion = appVersion
  saveConfig(next)
  return next
}

/**
 * Merged gespeicherte Nutzerdaten mit Defaults.
 * Ersetzt niemals vorhandene Szenen/Quellen durch Defaults.
 */
function migrateConfig(config: AppConfig): AppConfig {
  const defaults = createDefaultConfig()
  const savedTheme = config.theme
  const isLegacyMidnight =
    !savedTheme ||
    (savedTheme.bg === '#0e1116' && savedTheme.accent === '#3d9cf0')

  // Audio aus Szenen herauslösen (Legacy → global)
  const hoistedAudio: import('../src/shared/types').StreamSource[] = []
  const seenAudioIds = new Set<string>()

  function takeAudio(source: import('../src/shared/types').StreamSource) {
    if (!isAudioSource(source.type)) return
    if (seenAudioIds.has(source.id)) return
    seenAudioIds.add(source.id)
    hoistedAudio.push(
      withSourceTransform({
        ...source,
        enabled: source.enabled !== false,
      }),
    )
  }

  for (const scene of config.scenes ?? []) {
    for (const source of scene.sources ?? []) takeAudio(source)
  }
  for (const source of config.audioSources ?? []) takeAudio(source)

  const scenes: Scene[] =
    Array.isArray(config.scenes) && config.scenes.length > 0
      ? config.scenes.map((scene) => ({
          ...scene,
          id: scene.id || `scene-${Math.random().toString(36).slice(2, 8)}`,
          name: scene.name || 'Szene',
          sources: (scene.sources ?? [])
            .filter((s) => isVisualSource(s.type))
            .map((source) =>
              withSourceTransform({
                ...source,
                enabled: source.enabled !== false,
              }),
            ),
        }))
      : defaults.scenes

  const audioSources =
    hoistedAudio.length > 0 ? hoistedAudio : defaults.audioSources

  const activeStillExists = scenes.some((s) => s.id === config.activeSceneId)

  return {
    version: CONFIG_SCHEMA_VERSION,
    lastAppVersion: config.lastAppVersion,
    settings: {
      ...defaults.settings,
      ...config.settings,
      channelName: config.settings?.channelName ?? defaults.settings.channelName,
      updateFeedUrl:
        config.settings?.updateFeedUrl ?? defaults.settings.updateFeedUrl,
      streamKey: config.settings?.streamKey ?? '',
      customRtmpUrl:
        config.settings?.customRtmpUrl ?? defaults.settings.customRtmpUrl,
      platform: config.settings?.platform ?? defaults.settings.platform,
      transition: {
        ...defaults.settings.transition,
        ...(config.settings?.transition ?? {}),
      },
      alerts: normalizeAlerts(config.settings?.alerts),
      encoder: normalizeEncoderSettings(config.settings?.encoder),
    },
    theme: isLegacyMidnight
      ? defaultTheme()
      : {
          ...defaultTheme(),
          ...savedTheme,
        },
    scenes,
    activeSceneId: activeStillExists
      ? (config.activeSceneId as string)
      : scenes[0]?.id || defaults.activeSceneId,
    audioSources,
    layout: normalizeUiLayout(config.layout),
  }
}
