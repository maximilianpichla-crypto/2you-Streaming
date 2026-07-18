import { useState } from 'react'
import type {
  DisplayInfo,
  MediaDeviceInfoLite,
  Scene,
  StreamSource,
  WindowInfo,
} from '../shared/types'
import { sourceLabel } from '../shared/types'
import { AddSourceModal } from './AddSourceModal'
import { AudioLevelMeter, isAudioSourceType } from './AudioLevelMeter'

interface Props {
  scene: Scene | undefined
  scenes: Scene[]
  displays: DisplayInfo[]
  windows: WindowInfo[]
  cameras: MediaDeviceInfoLite[]
  mics: MediaDeviceInfoLite[]
  speakers: MediaDeviceInfoLite[]
  selectedSourceId?: string | null
  onSelectSource?: (sourceId: string | null) => void
  onToggle: (sourceId: string) => void
  onUpdateSource: (sourceId: string, patch: Partial<StreamSource>) => void
  onAddSource: (type: StreamSource['type']) => void
  onRemoveSource: (sourceId: string) => void
  onMove: (sourceId: string, direction: -1 | 1) => void
  onPickFile: (sourceId: string, kind: 'image' | 'media' | 'slideshow') => void
  onPickWindowCapture?: (kind: 'window' | 'game') => void
  embedded?: boolean
}

function SourceEditor({
  source,
  scene,
  scenes,
  displays,
  windows,
  cameras,
  mics,
  speakers,
  onUpdateSource,
  onPickFile,
}: {
  source: StreamSource
  scene: Scene
  scenes: Scene[]
  displays: DisplayInfo[]
  windows: WindowInfo[]
  cameras: MediaDeviceInfoLite[]
  mics: MediaDeviceInfoLite[]
  speakers: MediaDeviceInfoLite[]
  onUpdateSource: (sourceId: string, patch: Partial<StreamSource>) => void
  onPickFile: (sourceId: string, kind: 'image' | 'media' | 'slideshow') => void
}) {
  const settings = source.settings ?? {}

  if (source.type === 'display') {
    return (
      <select
        style={{ marginTop: '0.45rem' }}
        value={source.deviceId ?? '0'}
        onChange={(e) => {
          const display = displays.find((d) => String(d.index) === e.target.value)
          onUpdateSource(source.id, {
            deviceId: e.target.value,
            deviceLabel: display?.name,
          })
        }}
      >
        {displays.length === 0 && <option value="0">Monitor 1</option>}
        {displays.map((d) => (
          <option key={d.id} value={String(d.index)}>
            {d.name}
          </option>
        ))}
      </select>
    )
  }

  if (source.type === 'window' || source.type === 'game') {
    return (
      <select
        style={{ marginTop: '0.45rem' }}
        value={source.deviceId ?? ''}
        onChange={(e) => {
          const win = windows.find((w) => w.id === e.target.value)
          onUpdateSource(source.id, {
            deviceId: e.target.value,
            deviceLabel: win?.name,
            name: win?.name || source.name,
            settings: {
              ...settings,
              windowTitle: win?.name,
            },
          })
        }}
      >
        <option value="">
          {source.type === 'game' ? 'Spiel / Fenster wählen…' : 'Fenster wählen…'}
        </option>
        {windows.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    )
  }

  if (source.type === 'webcam') {
    return (
      <select
        style={{ marginTop: '0.45rem' }}
        value={source.deviceId ?? ''}
        onChange={(e) => {
          const cam = cameras.find((c) => c.deviceId === e.target.value)
          onUpdateSource(source.id, {
            deviceId: e.target.value,
            deviceLabel: cam?.label,
            name: cam?.label || 'Videoaufnahmegerät',
          })
        }}
      >
        <option value="">Gerät wählen…</option>
        {cameras.map((c) => (
          <option key={c.deviceId} value={c.deviceId}>
            {c.label || c.deviceId}
          </option>
        ))}
      </select>
    )
  }

  if (source.type === 'microphone' || source.type === 'app_audio') {
    return (
      <div style={{ marginTop: '0.45rem' }} onClick={(e) => e.stopPropagation()}>
        <select
          value={source.deviceId ?? ''}
          onChange={(e) => {
            const mic = mics.find((m) => m.deviceId === e.target.value)
            onUpdateSource(source.id, {
              deviceId: e.target.value,
              deviceLabel: mic?.label,
              name: mic?.label || sourceLabel(source.type),
            })
          }}
        >
          <option value="">Gerät wählen…</option>
          {mics.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label || m.deviceId}
            </option>
          ))}
        </select>
        <AudioLevelMeter
          deviceId={source.deviceId}
          deviceLabel={source.deviceLabel}
          enabled={source.enabled}
          volume={settings.volume ?? 100}
          onVolumeChange={(volume) =>
            onUpdateSource(source.id, {
              settings: { ...settings, volume },
            })
          }
        />
      </div>
    )
  }

  if (source.type === 'desktop_audio') {
    return (
      <div style={{ marginTop: '0.45rem' }} onClick={(e) => e.stopPropagation()}>
        <select
          value={source.deviceId ?? ''}
          onChange={(e) => {
            const sp = speakers.find((m) => m.deviceId === e.target.value)
            onUpdateSource(source.id, {
              deviceId: e.target.value,
              deviceLabel: sp?.label,
              name: sp?.label || 'Audio-Ausgabeaufnahme',
            })
          }}
        >
          <option value="">Ausgabegerät / Loopback wählen…</option>
          {speakers.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label || m.deviceId}
            </option>
          ))}
          {speakers.length === 0 &&
            mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || m.deviceId}
              </option>
            ))}
        </select>
        <AudioLevelMeter
          deviceId={source.deviceId}
          deviceLabel={source.deviceLabel}
          enabled={source.enabled}
          volume={settings.volume ?? 100}
          onVolumeChange={(volume) =>
            onUpdateSource(source.id, {
              settings: { ...settings, volume },
            })
          }
        />
      </div>
    )
  }

  if (source.type === 'browser') {
    return (
      <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
        <input
          value={settings.url ?? ''}
          placeholder="https://…"
          onChange={(e) =>
            onUpdateSource(source.id, {
              settings: { ...settings, url: e.target.value },
            })
          }
        />
        <div className="row">
          <input
            type="number"
            value={settings.width ?? 1920}
            title="Breite"
            onChange={(e) =>
              onUpdateSource(source.id, {
                settings: { ...settings, width: Number(e.target.value) || 1920 },
              })
            }
          />
          <input
            type="number"
            value={settings.height ?? 1080}
            title="Höhe"
            onChange={(e) =>
              onUpdateSource(source.id, {
                settings: { ...settings, height: Number(e.target.value) || 1080 },
              })
            }
          />
        </div>
      </div>
    )
  }

  if (source.type === 'image') {
    return (
      <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
        <input
          value={settings.filePath ?? ''}
          placeholder="Bildpfad…"
          readOnly
        />
        <button type="button" onClick={() => onPickFile(source.id, 'image')}>
          Bild wählen…
        </button>
      </div>
    )
  }

  if (source.type === 'slideshow') {
    const count = settings.filePaths?.length ?? 0
    return (
      <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {count} Bild{count === 1 ? '' : 'er'} ausgewählt
        </span>
        <button type="button" onClick={() => onPickFile(source.id, 'slideshow')}>
          Bilder wählen…
        </button>
      </div>
    )
  }

  if (source.type === 'media') {
    return (
      <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
        <input value={settings.filePath ?? ''} placeholder="Mediendatei…" readOnly />
        <button type="button" onClick={() => onPickFile(source.id, 'media')}>
          Datei wählen…
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.loop ?? true}
            onChange={(e) =>
              onUpdateSource(source.id, {
                settings: { ...settings, loop: e.target.checked },
              })
            }
          />
          Wiederholen
        </label>
      </div>
    )
  }

  if (source.type === 'text') {
    return (
      <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
        <textarea
          rows={3}
          value={settings.text ?? ''}
          onChange={(e) =>
            onUpdateSource(source.id, {
              settings: { ...settings, text: e.target.value },
            })
          }
          style={{
            width: '100%',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '0.45rem 0.6rem',
            color: 'inherit',
            resize: 'vertical',
          }}
        />
        <div className="row">
          <input
            type="number"
            value={settings.fontSize ?? 48}
            onChange={(e) =>
              onUpdateSource(source.id, {
                settings: { ...settings, fontSize: Number(e.target.value) || 48 },
              })
            }
          />
          <input
            type="color"
            value={settings.fontColor ?? '#ffffff'}
            onChange={(e) =>
              onUpdateSource(source.id, {
                settings: { ...settings, fontColor: e.target.value },
              })
            }
          />
        </div>
      </div>
    )
  }

  if (source.type === 'color') {
    return (
      <div style={{ marginTop: '0.45rem' }}>
        <input
          type="color"
          value={settings.color ?? '#1a2332'}
          onChange={(e) =>
            onUpdateSource(source.id, {
              settings: { ...settings, color: e.target.value },
            })
          }
        />
      </div>
    )
  }

  if (source.type === 'scene') {
    return (
      <select
        style={{ marginTop: '0.45rem' }}
        value={settings.sceneId ?? ''}
        onChange={(e) =>
          onUpdateSource(source.id, {
            settings: { ...settings, sceneId: e.target.value },
            name:
              scenes.find((s) => s.id === e.target.value)?.name || source.name,
          })
        }
      >
        <option value="">Szene wählen…</option>
        {scenes
          .filter((s) => s.id !== scene.id)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
    )
  }

  return null
}

export function SourcesPanel({
  scene,
  scenes,
  displays,
  windows,
  cameras,
  mics,
  speakers,
  selectedSourceId = null,
  onSelectSource,
  onToggle,
  onUpdateSource,
  onAddSource,
  onRemoveSource,
  onMove,
  onPickFile,
  onPickWindowCapture,
  embedded = false,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  if (!scene) {
    return (
      <div className={`panel ${embedded ? 'embedded' : ''}`}>
        {!embedded && <div className="panel-header">Quellen</div>}
        <div className="panel-body">Keine Szene ausgewählt</div>
      </div>
    )
  }

  return (
    <div
      className={`panel ${embedded ? 'embedded' : ''}`}
      style={embedded ? undefined : { borderTop: '1px solid var(--border)' }}
    >
      {!embedded && <div className="panel-header">Quellen — {scene.name}</div>}
      <div className="panel-body">
        <div className="list">
          {scene.sources.map((source, index) => (
            <div
              key={source.id}
              className={`list-item ${selectedSourceId === source.id ? 'active' : ''}`}
              style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }}
              onClick={() => onSelectSource?.(source.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="ghost"
                  style={{ padding: '0.2rem' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(source.id)
                  }}
                  title="Ein/Aus"
                >
                  <span className={`check ${source.enabled ? 'on' : ''}`} />
                </button>
                <strong style={{ fontSize: '0.9rem' }}>{source.name}</strong>
                <span className="meta">{sourceLabel(source.type)}</span>
              </div>

              {isAudioSourceType(source.type) && selectedSourceId !== source.id && (
                <AudioLevelMeter
                  compact
                  deviceId={source.deviceId}
                  deviceLabel={source.deviceLabel}
                  enabled={source.enabled}
                  volume={source.settings?.volume ?? 100}
                />
              )}

              {selectedSourceId === source.id && (
                <>
                  <SourceEditor
                    source={source}
                    scene={scene}
                    scenes={scenes}
                    displays={displays}
                    windows={windows}
                    cameras={cameras}
                    mics={mics}
                    speakers={speakers}
                    onUpdateSource={onUpdateSource}
                    onPickFile={onPickFile}
                  />

                  <div className="source-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="ghost"
                      disabled={index === 0}
                      onClick={() => onMove(source.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={index === scene.sources.length - 1}
                      onClick={() => onMove(source.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => onRemoveSource(source.id)}
                    >
                      Entfernen
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="section-title">Quelle hinzufügen</div>
        <div className="source-actions">
          <button type="button" className="primary" onClick={() => setModalOpen(true)}>
            + Quelle (wie OBS)
          </button>
          <button
            type="button"
            title="Ctrl+Shift+F"
            onClick={() => onPickWindowCapture?.('window')}
          >
            Fenster anklicken…
          </button>
          <button
            type="button"
            title="Ctrl+Shift+G"
            onClick={() => onPickWindowCapture?.('game')}
          >
            Spiel anklicken…
          </button>
        </div>
        <p className="obs-hint" style={{ paddingLeft: 0, marginTop: '0.35rem' }}>
          Hotkeys: Ctrl+Shift+F (Fenster) · Ctrl+Shift+G (Spiel) — dann Ziel anklicken
        </p>
      </div>

      <AddSourceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onPick={onAddSource}
      />
    </div>
  )
}
