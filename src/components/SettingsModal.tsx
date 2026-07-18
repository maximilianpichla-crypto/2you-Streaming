import { useEffect, useState } from 'react'
import type {
  PlatformId,
  StreamSettings,
  ThemeColors,
  TransitionSettings,
  VideoEncoderId,
} from '../shared/types'
import {
  PLATFORM_PRESETS,
  THEME_COLOR_FIELDS,
  THEME_PRESETS,
  TRANSITION_PRESETS,
  VIDEO_ENCODERS,
  defaultAlerts,
  normalizeAlerts,
  defaultTheme,
  getEncoderInfo,
  type TransitionId,
} from '../shared/types'
import { DEFAULT_UPDATE_FEED_URL } from '../shared/updates'
import { AlertEditor } from './AlertEditor'

export type SettingsCategory =
  | 'general'
  | 'stream'
  | 'output'
  | 'video'
  | 'audio'
  | 'alerts'
  | 'transition'
  | 'appearance'
  | 'advanced'

const CATEGORIES: { id: SettingsCategory; label: string }[] = [
  { id: 'general', label: 'Allgemein' },
  { id: 'stream', label: 'Stream' },
  { id: 'output', label: 'Ausgabe' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'transition', label: 'Übergang' },
  { id: 'appearance', label: 'Darstellung' },
  { id: 'advanced', label: 'Erweitert' },
]

interface Props {
  open: boolean
  settings: StreamSettings
  theme: ThemeColors
  availableEncoders: VideoEncoderId[]
  streaming: boolean
  ffmpegPath?: string
  initialCategory?: SettingsCategory
  onClose: () => void
  onApply: (payload: { settings: StreamSettings; theme: ThemeColors }) => void
}

/** Map legacy tab names from StreamPanel */
export function mapTabToCategory(
  tab?: 'stream' | 'encoder' | 'transition',
): SettingsCategory {
  if (tab === 'encoder') return 'output'
  if (tab === 'transition') return 'transition'
  if (tab === 'stream') return 'stream'
  return 'output'
}

export function SettingsModal({
  open,
  settings,
  theme,
  availableEncoders,
  streaming,
  ffmpegPath,
  initialCategory = 'output',
  onClose,
  onApply,
}: Props) {
  const [category, setCategory] = useState<SettingsCategory>(initialCategory)
  const [draftSettings, setDraftSettings] = useState(settings)
  const [draftTheme, setDraftTheme] = useState(theme)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!open) return
    setCategory(initialCategory)
    setDraftSettings({
      ...settings,
      alerts: normalizeAlerts(settings.alerts ?? defaultAlerts()),
    })
    setDraftTheme(theme)
    setDirty(false)
  }, [open, initialCategory, settings, theme])

  if (!open) return null

  const encoderId = draftSettings.encoder.videoEncoder ?? 'x264'
  const encoderInfo = getEncoderInfo(encoderId)
  const selectable = VIDEO_ENCODERS.filter(
    (e) => availableEncoders.includes(e.id) || e.id === 'x264',
  )

  function patchSettings(next: StreamSettings) {
    setDraftSettings(next)
    setDirty(true)
  }

  function patchTheme(next: ThemeColors) {
    setDraftTheme(next)
    setDirty(true)
  }

  function handleApply() {
    onApply({ settings: draftSettings, theme: draftTheme })
    setDirty(false)
  }

  function handleOk() {
    onApply({ settings: draftSettings, theme: draftTheme })
    setDirty(false)
    onClose()
  }

  function handleCancel() {
    setDraftSettings(settings)
    setDraftTheme(theme)
    setDirty(false)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="obs-settings"
        role="dialog"
        aria-modal="true"
        aria-label="Einstellungen"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="obs-settings-title">Einstellungen</div>

        <div className="obs-settings-main">
          <nav className="obs-settings-nav" aria-label="Kategorien">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`obs-nav-item ${category === c.id ? 'active' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </nav>

          <div className="obs-settings-content">
            <h3 className="obs-section-title">
              {CATEGORIES.find((c) => c.id === category)?.label}
            </h3>

            {category === 'general' && (
              <div className="obs-form">
                <div className="obs-row">
                  <label htmlFor="obs-channel">Twitch-Kanalname (Chat)</label>
                  <input
                    id="obs-channel"
                    value={draftSettings.channelName}
                    onChange={(e) =>
                      patchSettings({
                        ...draftSettings,
                        channelName: e.target.value,
                      })
                    }
                    placeholder="z. B. meinkanal"
                    spellCheck={false}
                  />
                </div>
                <p className="obs-hint">
                  Der Chat verbindet sich automatisch mit diesem Kanalnamen.
                </p>
                <div className="obs-row">
                  <label htmlFor="obs-update-feed">Update-Feed URL</label>
                  <input
                    id="obs-update-feed"
                    value={draftSettings.updateFeedUrl || DEFAULT_UPDATE_FEED_URL}
                    onChange={(e) =>
                      patchSettings({
                        ...draftSettings,
                        updateFeedUrl: e.target.value,
                      })
                    }
                    placeholder={DEFAULT_UPDATE_FEED_URL}
                    spellCheck={false}
                  />
                </div>
                <p className="obs-hint">
                  Standard: GitHub Raw von{' '}
                  <code>maximilianpichla-crypto/2you-Streaming</code>
                  {' '}→ <code>updates/feed.json</code>. Repo muss öffentlich sein.
                </p>
              </div>
            )}

            {category === 'stream' && (
              <div className="obs-form">
                <div className="obs-row">
                  <label htmlFor="obs-platform">Dienst</label>
                  <select
                    id="obs-platform"
                    value={draftSettings.platform}
                    disabled={streaming}
                    onChange={(e) =>
                      patchSettings({
                        ...draftSettings,
                        platform: e.target.value as PlatformId,
                      })
                    }
                  >
                    <option value="twitch">Twitch</option>
                    <option value="youtube">YouTube</option>
                    <option value="custom">Benutzerdefiniert…</option>
                  </select>
                </div>

                {draftSettings.platform === 'custom' ? (
                  <div className="obs-row">
                    <label htmlFor="obs-rtmp">Server</label>
                    <input
                      id="obs-rtmp"
                      value={draftSettings.customRtmpUrl}
                      disabled={streaming}
                      onChange={(e) =>
                        patchSettings({
                          ...draftSettings,
                          customRtmpUrl: e.target.value,
                        })
                      }
                      placeholder="rtmp://..."
                    />
                  </div>
                ) : (
                  <div className="obs-row">
                    <label>Server</label>
                    <input
                      value={PLATFORM_PRESETS[draftSettings.platform].rtmpUrl}
                      readOnly
                      disabled
                    />
                  </div>
                )}

                <div className="obs-row">
                  <label htmlFor="obs-key">Stream-Schlüssel</label>
                  <input
                    id="obs-key"
                    type="password"
                    autoComplete="off"
                    value={draftSettings.streamKey}
                    disabled={streaming}
                    onChange={(e) =>
                      patchSettings({
                        ...draftSettings,
                        streamKey: e.target.value,
                      })
                    }
                    placeholder="Stream-Key"
                  />
                </div>
              </div>
            )}

            {category === 'output' && (
              <div className="obs-form">
                <div className="obs-row">
                  <label htmlFor="obs-venc">Video-Encoder</label>
                  <select
                    id="obs-venc"
                    value={encoderId}
                    disabled={streaming}
                    onChange={(e) => {
                      const id = e.target.value as VideoEncoderId
                      const info = getEncoderInfo(id)
                      patchSettings({
                        ...draftSettings,
                        encoder: {
                          ...draftSettings.encoder,
                          videoEncoder: id,
                          preset: info.defaultPreset,
                        },
                      })
                    }}
                  >
                    {selectable.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                    {VIDEO_ENCODERS.filter(
                      (e) => !selectable.some((s) => s.id === e.id),
                    ).map((e) => (
                      <option key={e.id} value={e.id} disabled>
                        {e.label} (nicht verfügbar)
                      </option>
                    ))}
                  </select>
                </div>
                <p className="obs-hint">{encoderInfo.description}</p>

                <div className="obs-row">
                  <label htmlFor="obs-preset">Encoder-Voreinstellung</label>
                  <select
                    id="obs-preset"
                    value={
                      encoderInfo.presets.some(
                        (p) => p.id === draftSettings.encoder.preset,
                      )
                        ? draftSettings.encoder.preset
                        : encoderInfo.defaultPreset
                    }
                    disabled={streaming}
                    onChange={(e) =>
                      patchSettings({
                        ...draftSettings,
                        encoder: {
                          ...draftSettings.encoder,
                          preset: e.target.value,
                        },
                      })
                    }
                  >
                    {encoderInfo.presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="obs-row">
                  <label htmlFor="obs-vbr">Videobitrate</label>
                  <div className="obs-inline">
                    <input
                      id="obs-vbr"
                      type="number"
                      min={500}
                      max={12000}
                      step={100}
                      value={draftSettings.encoder.videoBitrate}
                      disabled={streaming}
                      onChange={(e) =>
                        patchSettings({
                          ...draftSettings,
                          encoder: {
                            ...draftSettings.encoder,
                            videoBitrate: Number(e.target.value) || 4500,
                          },
                        })
                      }
                    />
                    <span>Kbps</span>
                  </div>
                </div>
              </div>
            )}

            {category === 'video' && (
              <div className="obs-form">
                <div className="obs-row">
                  <label htmlFor="obs-res">Ausgangsauflösung</label>
                  <select
                    id="obs-res"
                    value={draftSettings.encoder.resolution}
                    disabled={streaming}
                    onChange={(e) =>
                      patchSettings({
                        ...draftSettings,
                        encoder: {
                          ...draftSettings.encoder,
                          resolution: e.target
                            .value as StreamSettings['encoder']['resolution'],
                        },
                      })
                    }
                  >
                    <option value="1920x1080">1920x1080</option>
                    <option value="1280x720">1280x720</option>
                  </select>
                </div>

                <div className="obs-row">
                  <label htmlFor="obs-fps">FPS-Werte</label>
                  <select
                    id="obs-fps"
                    value={draftSettings.encoder.fps}
                    disabled={streaming}
                    onChange={(e) =>
                      patchSettings({
                        ...draftSettings,
                        encoder: {
                          ...draftSettings.encoder,
                          fps: Number(e.target.value) as 30 | 60,
                        },
                      })
                    }
                  >
                    <option value={30}>30</option>
                    <option value={60}>60</option>
                  </select>
                </div>
              </div>
            )}

            {category === 'audio' && (
              <div className="obs-form">
                <div className="obs-row">
                  <label htmlFor="obs-abr">Audiobitrate</label>
                  <div className="obs-inline">
                    <input
                      id="obs-abr"
                      type="number"
                      min={64}
                      max={320}
                      step={16}
                      value={draftSettings.encoder.audioBitrate}
                      disabled={streaming}
                      onChange={(e) =>
                        patchSettings({
                          ...draftSettings,
                          encoder: {
                            ...draftSettings.encoder,
                            audioBitrate: Number(e.target.value) || 160,
                          },
                        })
                      }
                    />
                    <span>Kbps</span>
                  </div>
                </div>
                <p className="obs-hint">
                  Mikrofon und Desktop-Audio werden in den Quellen gewählt.
                </p>
              </div>
            )}

            {category === 'alerts' && (
              <AlertEditor
                alerts={normalizeAlerts(draftSettings.alerts)}
                onChange={(alerts) =>
                  patchSettings({ ...draftSettings, alerts })
                }
                onApplyAndTest={(alerts) => {
                  onApply({
                    settings: { ...draftSettings, alerts },
                    theme: draftTheme,
                  })
                  setDirty(false)
                }}
              />
            )}

            {category === 'transition' && (
              <div className="obs-form">
                <div className="obs-row">
                  <label htmlFor="obs-tx">Übergang</label>
                  <select
                    id="obs-tx"
                    value={draftSettings.transition.type}
                    onChange={(e) =>
                      patchSettings({
                        ...draftSettings,
                        transition: {
                          ...draftSettings.transition,
                          type: e.target.value as TransitionId,
                        },
                      })
                    }
                  >
                    {TRANSITION_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="obs-hint">
                  {
                    TRANSITION_PRESETS.find(
                      (p) => p.id === draftSettings.transition.type,
                    )?.description
                  }
                </p>

                <div className="obs-row">
                  <label htmlFor="obs-tx-ms">Dauer</label>
                  <div className="obs-inline">
                    <input
                      id="obs-tx-ms"
                      type="number"
                      min={100}
                      max={3000}
                      step={50}
                      value={draftSettings.transition.durationMs}
                      disabled={draftSettings.transition.type === 'cut'}
                      onChange={(e) =>
                        patchSettings({
                          ...draftSettings,
                          transition: {
                            ...draftSettings.transition,
                            durationMs: Number(e.target.value) || 500,
                          } satisfies TransitionSettings,
                        })
                      }
                    />
                    <span>ms</span>
                  </div>
                </div>
              </div>
            )}

            {category === 'appearance' && (
              <div className="obs-form">
                <div className="obs-row">
                  <label>Farbvorlage</label>
                  <div className="obs-preset-row">
                    {THEME_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="ghost obs-preset-btn"
                        onClick={() => patchTheme({ ...preset.colors })}
                      >
                        <span
                          className="theme-swatch"
                          style={{
                            background: `linear-gradient(135deg, ${preset.colors.bg}, ${preset.colors.accent})`,
                          }}
                        />
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="obs-color-grid">
                  {THEME_COLOR_FIELDS.map((field) => (
                    <label key={field.key} className="obs-color-item">
                      <span>{field.label}</span>
                      <span className="theme-color-controls">
                        <input
                          type="color"
                          value={normalizeHex(draftTheme[field.key])}
                          onChange={(e) =>
                            patchTheme({
                              ...draftTheme,
                              [field.key]: e.target.value,
                            })
                          }
                        />
                        <input
                          type="text"
                          value={draftTheme[field.key]}
                          spellCheck={false}
                          onChange={(e) =>
                            patchTheme({
                              ...draftTheme,
                              [field.key]: e.target.value,
                            })
                          }
                        />
                      </span>
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  className="ghost"
                  onClick={() => patchTheme(defaultTheme())}
                >
                  Standardfarben wiederherstellen
                </button>
              </div>
            )}

            {category === 'advanced' && (
              <div className="obs-form">
                <div className="obs-row">
                  <label>FFmpeg-Pfad</label>
                  <input value={ffmpegPath || '—'} readOnly disabled />
                </div>
                <p className="obs-hint">
                  {streaming
                    ? 'Während eines Live-Streams sind Encoder- und Ausgabe-Änderungen gesperrt.'
                    : 'Erweiterte Capture-/Encode-Optionen folgen in späteren Versionen.'}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="obs-settings-footer">
          <div className="obs-footer-left">
            {dirty && <span className="obs-dirty">Nicht übernommen</span>}
          </div>
          <div className="obs-footer-actions">
            <button type="button" className="primary" onClick={handleOk}>
              OK
            </button>
            <button type="button" onClick={handleCancel}>
              Abbrechen
            </button>
            <button type="button" disabled={!dirty} onClick={handleApply}>
              Übernehmen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function normalizeHex(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value[1]
    const g = value[2]
    const b = value[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#000000'
}
