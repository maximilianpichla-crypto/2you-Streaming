import { useState } from 'react'
import type { MediaDeviceInfoLite, StreamSource, WindowInfo } from '../shared/types'
import {
  AUDIO_SOURCE_TYPES,
  createSource,
  isAudioSource,
  sourceLabel,
} from '../shared/types'
import { AddSourceModal } from './AddSourceModal'
import { AudioLevelMeter } from './AudioLevelMeter'

interface Props {
  audioSources: StreamSource[]
  windows: WindowInfo[]
  mics: MediaDeviceInfoLite[]
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onChange: (sources: StreamSource[]) => void
  embedded?: boolean
}

export function AudioSourcesPanel({
  audioSources,
  windows,
  mics,
  selectedId = null,
  onSelect,
  onChange,
  embedded = false,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const sources = audioSources.filter((s) => isAudioSource(s.type))

  function patch(id: string, next: Partial<StreamSource>) {
    onChange(sources.map((s) => (s.id === id ? { ...s, ...next } : s)))
  }

  function renderEditor(source: StreamSource) {
    const settings = source.settings ?? {}

    if (source.type === 'microphone') {
      return (
        <div style={{ marginTop: '0.45rem' }} onClick={(e) => e.stopPropagation()}>
          <select
            value={source.deviceId ?? ''}
            onChange={(e) => {
              const mic = mics.find((m) => m.deviceId === e.target.value)
              patch(source.id, {
                deviceId: e.target.value,
                deviceLabel: mic?.label,
                name: mic?.label || sourceLabel(source.type),
              })
            }}
          >
            <option value="">Mikrofon wählen…</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || m.deviceId}
              </option>
            ))}
          </select>
          <AudioLevelMeter
            mode="device"
            deviceId={source.deviceId}
            deviceLabel={source.deviceLabel}
            enabled={source.enabled}
            volume={settings.volume ?? 100}
            onVolumeChange={(volume) =>
              patch(source.id, { settings: { ...settings, volume } })
            }
          />
        </div>
      )
    }

    if (source.type === 'desktop_audio') {
      return (
        <div style={{ marginTop: '0.45rem' }} onClick={(e) => e.stopPropagation()}>
          <p className="obs-hint" style={{ margin: '0 0 0.35rem' }}>
            PC-Wiedergabe (WASAPI) — unabhängig von der Szene.
          </p>
          <AudioLevelMeter
            mode="loopback"
            processId={null}
            processName={null}
            enabled={source.enabled}
            volume={settings.volume ?? 100}
            onVolumeChange={(volume) =>
              patch(source.id, { settings: { ...settings, volume } })
            }
          />
        </div>
      )
    }

    if (source.type === 'app_audio') {
      const apps = windows.filter((w) => w.processId && w.name.trim())
      const selectedPid = String(settings.processId ?? source.deviceId ?? '')
      return (
        <div style={{ marginTop: '0.45rem' }} onClick={(e) => e.stopPropagation()}>
          <select
            value={selectedPid}
            onChange={(e) => {
              const win = apps.find((w) => String(w.processId) === e.target.value)
              const pid = Number.parseInt(e.target.value, 10)
              patch(source.id, {
                deviceId: e.target.value,
                deviceLabel: win?.name,
                name: win?.name || 'Anwendungsaudio',
                settings: {
                  ...settings,
                  processId: Number.isFinite(pid) ? pid : undefined,
                  processName: win?.processName,
                  volume: settings.volume ?? 100,
                },
              })
            }}
          >
            <option value="">Anwendung / Fenster wählen…</option>
            {apps.map((w) => (
              <option key={`${w.processId}-${w.id}`} value={String(w.processId)}>
                {w.name}
                {w.processName ? ` (${w.processName})` : ''}
              </option>
            ))}
          </select>
          <AudioLevelMeter
            mode="loopback"
            processId={settings.processId ?? null}
            processName={settings.processName ?? null}
            enabled={
              source.enabled &&
              Boolean(settings.processId || settings.processName)
            }
            volume={settings.volume ?? 100}
            onVolumeChange={(volume) =>
              patch(source.id, { settings: { ...settings, volume } })
            }
          />
        </div>
      )
    }

    return null
  }

  return (
    <div className={`panel sources-panel ${embedded ? 'embedded' : ''}`}>
      {!embedded && <div className="panel-header">Audio</div>}
      <div className="panel-body">
        <p className="obs-hint" style={{ marginTop: 0 }}>
          Global — gilt für alle Szenen.
        </p>
        <div className="list">
          {sources.map((source, index) => (
            <div
              key={source.id}
              className={`list-item ${selectedId === source.id ? 'active' : ''}`}
              onClick={() => onSelect?.(source.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="ghost"
                  style={{ padding: '0.2rem' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    patch(source.id, { enabled: !source.enabled })
                  }}
                >
                  <span className={`check ${source.enabled ? 'on' : ''}`} />
                </button>
                <strong style={{ fontSize: '0.9rem' }}>{source.name}</strong>
                <span className="meta">{sourceLabel(source.type)}</span>
              </div>

              {selectedId !== source.id && (
                <AudioLevelMeter
                  compact
                  mode={source.type === 'microphone' ? 'device' : 'loopback'}
                  processId={
                    source.type === 'app_audio'
                      ? (source.settings?.processId ?? null)
                      : source.type === 'desktop_audio'
                        ? null
                        : undefined
                  }
                  processName={
                    source.type === 'app_audio'
                      ? (source.settings?.processName ?? null)
                      : source.type === 'desktop_audio'
                        ? null
                        : undefined
                  }
                  deviceId={source.deviceId}
                  deviceLabel={source.deviceLabel}
                  enabled={
                    source.enabled &&
                    (source.type !== 'app_audio' ||
                      Boolean(
                        source.settings?.processId || source.settings?.processName,
                      ))
                  }
                  volume={source.settings?.volume ?? 100}
                />
              )}

              {selectedId === source.id && (
                <>
                  {renderEditor(source)}
                  <div className="row" style={{ marginTop: '0.45rem' }}>
                    <button
                      type="button"
                      className="ghost"
                      disabled={index === 0}
                      onClick={() => {
                        if (index === 0) return
                        const next = [...sources]
                        const [item] = next.splice(index, 1)
                        next.splice(index - 1, 0, item)
                        onChange(next)
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={index === sources.length - 1}
                      onClick={() => {
                        if (index >= sources.length - 1) return
                        const next = [...sources]
                        const [item] = next.splice(index, 1)
                        next.splice(index + 1, 0, item)
                        onChange(next)
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        if (selectedId === source.id) onSelect?.(null)
                        onChange(sources.filter((s) => s.id !== source.id))
                      }}
                    >
                      Entfernen
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="section-title">Audio hinzufügen</div>
        <div className="source-actions">
          <button type="button" className="primary" onClick={() => setModalOpen(true)}>
            + Audio-Quelle
          </button>
        </div>
      </div>

      <AddSourceModal
        open={modalOpen}
        mode="audio"
        onClose={() => setModalOpen(false)}
        onPick={(type) => {
          if (!AUDIO_SOURCE_TYPES.includes(type)) return
          const source = createSource(type)
          onSelect?.(source.id)
          onChange([...sources, source])
          setModalOpen(false)
        }}
      />
    </div>
  )
}
