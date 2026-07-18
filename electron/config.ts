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
} from '../src/shared/types'

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): AppConfig {
  const file = configPath()
  try {
    if (!fs.existsSync(file)) {
      const defaults = createDefaultConfig()
      saveConfig(defaults)
      return defaults
    }
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw) as AppConfig
    return migrateConfig(parsed)
  } catch {
    const defaults = createDefaultConfig()
    saveConfig(defaults)
    return defaults
  }
}

export function saveConfig(config: AppConfig): void {
  const file = configPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
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
  config.scenes = scenes
  config.activeSceneId = activeSceneId
  saveConfig(config)
  return config
}

export function updateLayout(layout: import('../src/shared/types').UiLayout): AppConfig {
  const config = loadConfig()
  config.layout = normalizeUiLayout(layout)
  saveConfig(config)
  return config
}

function migrateConfig(config: AppConfig): AppConfig {
  const defaults = createDefaultConfig()
  const savedTheme = config.theme
  const isLegacyMidnight =
    !savedTheme ||
    (savedTheme.bg === '#0e1116' && savedTheme.accent === '#3d9cf0')

  return {
    version: 2,
    settings: {
      ...defaults.settings,
      ...config.settings,
      channelName: config.settings?.channelName ?? defaults.settings.channelName,
      updateFeedUrl:
        config.settings?.updateFeedUrl ?? defaults.settings.updateFeedUrl,
      transition: {
        ...defaults.settings.transition,
        ...(config.settings?.transition ?? {}),
      },
      alerts: normalizeAlerts(config.settings?.alerts),
      encoder: {
        ...defaults.settings.encoder,
        ...(config.settings?.encoder ?? {}),
        videoEncoder: config.settings?.encoder?.videoEncoder ?? 'x264',
        preset: config.settings?.encoder?.preset ?? 'veryfast',
      },
    },
    theme: isLegacyMidnight
      ? defaultTheme()
      : {
          ...defaultTheme(),
          ...savedTheme,
        },
    scenes: Array.isArray(config.scenes) && config.scenes.length > 0
      ? config.scenes.map((scene) => ({
          ...scene,
          sources: (scene.sources ?? []).map((source) => withSourceTransform(source)),
        }))
      : defaults.scenes,
    activeSceneId: config.activeSceneId || defaults.activeSceneId,
    layout: normalizeUiLayout(config.layout),
  }
}
