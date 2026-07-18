import { useEffect, useState } from 'react'
import type {
  EncoderSettings,
  PlatformId,
  StreamSettings,
  ThemeColors,
  TransitionSettings,
  VideoEncoderId,
} from '../shared/types'
import {
  OUTPUT_FPS_OPTIONS,
  OUTPUT_RESOLUTIONS,
  PLATFORM_PRESETS,
  THEME_COLOR_FIELDS,
  THEME_PRESETS,
  TRANSITION_PRESETS,
  VIDEO_ENCODERS,
  defaultAlerts,
  normalizeAlerts,
  normalizeEncoderSettings,
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
      encoder: normalizeEncoderSettings(settings.encoder),
      alerts: normalizeAlerts(settings.alerts ?? defaultAlerts()),
    })
    setDraftTheme(theme)
    setDirty(false)
  }, [open, initialCategory, settings, theme])

  if (!open) return null

  const encoder = normalizeEncoderSettings(draftSettings.encoder)
  const encoderId = encoder.videoEncoder
  const encoderInfo = getEncoderInfo(encoderId)
  const advanced = encoder.outputMode === 'advanced'
  const selectable = VIDEO_ENCODERS.filter(
    (e) => availableEncoders.includes(e.id) || e.id === 'x264',
  )

  function patchSettings(next: StreamSettings) {
    setDraftSettings(next)
    setDirty(true)
  }

  function patchEncoder(partial: Partial<EncoderSettings>) {
    patchSettings({
      ...draftSettings,
      encoder: normalizeEncoderSettings({
        ...draftSettings.encoder,
        ...partial,
      }),
    })
  }

  function patchTheme(next: ThemeColors) {
    setDraftTheme(next)
    setDirty(true)
  }

  function handleApply() {
    onApply({
      settings: {
        ...draftSettings,
        encoder: normalizeEncoderSettings(draftSettings.encoder),
      },
      theme: draftTheme,
    })
    setDirty(false)
  }

  function handleOk() {
    handleApply()
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
                  Standard: GitHub Raw →{' '}
                  <code>maximilianpichla-crypto/2you-Streaming</code>
                  {' '}/ <code>updates/feed.json</code>
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
                  <label htmlFor="obs-out-mode">Ausgabemodus</label>
                  <select
                    id="obs-out-mode"
                    value={encoder.outputMode}
                    disabled={streaming}
                    onChange={(e) =>
                      patchEncoder({
                        outputMode:
                          e.target.value === 'advanced' ? 'advanced' : 'simple',
                      })
                    }
                  >
                    <option value="simple">Einfach</option>
                    <option value="advanced">Fortgeschritten</option>
                  </select>
                </div>
                <p className="obs-hint">
                  {advanced
                    ? 'Volle Kontrolle über Rate Control, Keyframes, Profil und mehr.'
                    : 'Wenige Einstellungen — ideal für den schnellen Start.'}
                </p>

                <div className="obs-row">
                  <label htmlFor="obs-venc">Video-Encoder</label>
                  <select
                    id="obs-venc"
                    value={encoderId}
                    disabled={streaming}
                    onChange={(e) => {
                      const id = e.target.value as VideoEncoderId
                      const info = getEncoderInfo(id)
                      patchEncoder({
                        videoEncoder: id,
                        preset: info.defaultPreset,
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
                      encoderInfo.presets.some((p) => p.id === encoder.preset)
                        ? encoder.preset
                        : encoderInfo.defaultPreset
                    }
                    disabled={streaming}
                    onChange={(e) => patchEncoder({ preset: e.target.value })}
                  >
                    {encoderInfo.presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {advanced && (
                  <div className="obs-row">
                    <label htmlFor="obs-rc">Rate Control</label>
                    <select
                      id="obs-rc"
                      value={encoder.rateControl}
                      disabled={streaming}
                      onChange={(e) =>
                        patchEncoder({
                          rateControl: e.target.value as EncoderSettings['rateControl'],
                        })
                      }
                    >
                      <option value="cbr">CBR (konstant, empfohlen für Stream)</option>
                      <option value="vbr">VBR (variabel)</option>
                      <option value="crf">CRF / CQP (Qualität)</option>
                    </select>
                  </div>
                )}

                {encoder.rateControl === 'crf' && advanced ? (
                  <div className="obs-row">
                    <label htmlFor="obs-crf">Qualität (CRF/CQ)</label>
                    <div className="obs-inline">
                      <input
                        id="obs-crf"
                        type="number"
                        min={0}
                        max={51}
                        step={1}
                        value={encoder.crf}
                        disabled={streaming}
                        onChange={(e) =>
                          patchEncoder({
                            crf: Number(e.target.value) || 23,
                          })
                        }
                      />
                      <span>0–51 (niedriger = besser)</span>
                    </div>
                  </div>
                ) : (
                  <div className="obs-row">
                    <label htmlFor="obs-vbr">Videobitrate</label>
                    <div className="obs-inline">
                      <input
                        id="obs-vbr"
                        type="number"
                        min={500}
                        max={50000}
                        step={100}
                        value={encoder.videoBitrate}
                        disabled={streaming}
                        onChange={(e) =>
                          patchEncoder({
                            videoBitrate: Number(e.target.value) || 4500,
                          })
                        }
                      />
                      <span>Kbps</span>
                    </div>
                  </div>
                )}

                {advanced && (
                  <>
                    <div className="obs-row">
                      <label htmlFor="obs-keyint">Keyframe-Intervall</label>
                      <div className="obs-inline">
                        <input
                          id="obs-keyint"
                          type="number"
                          min={0.5}
                          max={10}
                          step={0.5}
                          value={encoder.keyframeIntervalSec}
                          disabled={streaming}
                          onChange={(e) =>
                            patchEncoder({
                              keyframeIntervalSec:
                                Number(e.target.value) || 2,
                            })
                          }
                        />
                        <span>Sekunden</span>
                      </div>
                    </div>

                    <div className="obs-row">
                      <label htmlFor="obs-profile">Profil</label>
                      <select
                        id="obs-profile"
                        value={encoder.profile}
                        disabled={streaming}
                        onChange={(e) =>
                          patchEncoder({
                            profile: e.target
                              .value as EncoderSettings['profile'],
                          })
                        }
                      >
                        <option value="baseline">baseline</option>
                        <option value="main">main</option>
                        <option value="high">high</option>
                      </select>
                    </div>

                    <div className="obs-row">
                      <label htmlFor="obs-bf">B-Frames</label>
                      <div className="obs-inline">
                        <input
                          id="obs-bf"
                          type="number"
                          min={0}
                          max={16}
                          step={1}
                          value={encoder.bframes}
                          disabled={streaming}
                          onChange={(e) =>
                            patchEncoder({
                              bframes: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="obs-row">
                      <label htmlFor="obs-buf">Puffergröße</label>
                      <div className="obs-inline">
                        <input
                          id="obs-buf"
                          type="number"
                          min={0.5}
                          max={8}
                          step={0.5}
                          value={encoder.bufsizeMultiplier}
                          disabled={streaming}
                          onChange={(e) =>
                            patchEncoder({
                              bufsizeMultiplier:
                                Number(e.target.value) || 2,
                            })
                          }
                        />
                        <span>× Bitrate</span>
                      </div>
                    </div>

                    <div className="obs-row">
                      <label htmlFor="obs-tune">Tune</label>
                      <select
                        id="obs-tune"
                        value={encoder.tune}
                        disabled={streaming}
                        onChange={(e) =>
                          patchEncoder({ tune: e.target.value })
                        }
                      >
                        <option value="auto">Automatisch (Stream)</option>
                        <option value="none">Keins</option>
                        <option value="zerolatency">zerolatency (x264)</option>
                        <option value="ll">ll (NVENC Low Latency)</option>
                        <option value="hq">hq (NVENC Qualität)</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            {category === 'video' && (
              <div className="obs-form">
                <div className="obs-row">
                  <label htmlFor="obs-res">Ausgangsauflösung</label>
                  <select
                    id="obs-res"
                    value={
                      OUTPUT_RESOLUTIONS.includes(
                        encoder.resolution as (typeof OUTPUT_RESOLUTIONS)[number],
                      )
                        ? encoder.resolution
                        : 'custom'
                    }
                    disabled={streaming}
                    onChange={(e) => {
                      if (e.target.value === 'custom') return
                      patchEncoder({ resolution: e.target.value })
                    }}
                  >
                    {OUTPUT_RESOLUTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    <option value="custom">Benutzerdefiniert…</option>
                  </select>
                </div>

                {(advanced ||
                  !OUTPUT_RESOLUTIONS.includes(
                    encoder.resolution as (typeof OUTPUT_RESOLUTIONS)[number],
                  )) && (
                  <div className="obs-row">
                    <label htmlFor="obs-res-custom">Eigene Auflösung</label>
                    <input
                      id="obs-res-custom"
                      type="text"
                      placeholder="z. B. 1920x1080"
                      value={encoder.resolution}
                      disabled={streaming}
                      spellCheck={false}
                      onChange={(e) =>
                        patchEncoder({ resolution: e.target.value.trim() })
                      }
                    />
                  </div>
                )}

                <div className="obs-row">
                  <label htmlFor="obs-fps">FPS</label>
                  <select
                    id="obs-fps"
                    value={encoder.fps}
                    disabled={streaming}
                    onChange={(e) =>
                      patchEncoder({ fps: Number(e.target.value) || 30 })
                    }
                  >
                    {OUTPUT_FPS_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                    {advanced &&
                      !OUTPUT_FPS_OPTIONS.includes(
                        encoder.fps as (typeof OUTPUT_FPS_OPTIONS)[number],
                      ) && (
                        <option value={encoder.fps}>{encoder.fps} (aktuell)</option>
                      )}
                  </select>
                </div>

                {advanced && (
                  <div className="obs-row">
                    <label htmlFor="obs-fps-custom">Eigene FPS</label>
                    <div className="obs-inline">
                      <input
                        id="obs-fps-custom"
                        type="number"
                        min={1}
                        max={120}
                        step={1}
                        value={encoder.fps}
                        disabled={streaming}
                        onChange={(e) =>
                          patchEncoder({
                            fps: Number(e.target.value) || 30,
                          })
                        }
                      />
                    </div>
                  </div>
                )}
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
                      value={encoder.audioBitrate}
                      disabled={streaming}
                      onChange={(e) =>
                        patchEncoder({
                          audioBitrate: Number(e.target.value) || 160,
                        })
                      }
                    />
                    <span>Kbps</span>
                  </div>
                </div>

                {advanced && (
                  <>
                    <div className="obs-row">
                      <label htmlFor="obs-asr">Abtastrate</label>
                      <select
                        id="obs-asr"
                        value={encoder.audioSampleRate}
                        disabled={streaming}
                        onChange={(e) =>
                          patchEncoder({
                            audioSampleRate: Number(
                              e.target.value,
                            ) as EncoderSettings['audioSampleRate'],
                          })
                        }
                      >
                        <option value={48000}>48 kHz</option>
                        <option value={44100}>44,1 kHz</option>
                      </select>
                    </div>
                    <div className="obs-row">
                      <label htmlFor="obs-ach">Kanäle</label>
                      <select
                        id="obs-ach"
                        value={encoder.audioChannels}
                        disabled={streaming}
                        onChange={(e) =>
                          patchEncoder({
                            audioChannels: Number(e.target.value) === 1 ? 1 : 2,
                          })
                        }
                      >
                        <option value={2}>Stereo</option>
                        <option value={1}>Mono</option>
                      </select>
                    </div>
                  </>
                )}

                <p className="obs-hint">
                  Mikrofon und Desktop-Audio werden im Audio-Panel gewählt.
                  {advanced
                    ? ''
                    : ' Für Abtastrate/Kanäle: Ausgabemodus → Fortgeschritten.'}
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
                <div className="obs-row">
                  <label>Ausgabemodus</label>
                  <select
                    value={encoder.outputMode}
                    disabled={streaming}
                    onChange={(e) =>
                      patchEncoder({
                        outputMode:
                          e.target.value === 'advanced' ? 'advanced' : 'simple',
                      })
                    }
                  >
                    <option value="simple">Einfach</option>
                    <option value="advanced">Fortgeschritten</option>
                  </select>
                </div>
                <p className="obs-hint">
                  Unter <strong>Ausgabe</strong> findest du Rate Control, Keyframes,
                  Profil, B-Frames und Tune — wenn Fortgeschritten aktiv ist.
                  {streaming
                    ? ' Während eines Live-Streams sind Encoder-Änderungen gesperrt.'
                    : ''}
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
