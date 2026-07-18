import type { StreamSettings, StreamStatus, VideoEncoderId } from '../shared/types'
import { STREAM_DELAY_PRESETS, getEncoderInfo } from '../shared/types'

interface Props {
  settings: StreamSettings
  status: StreamStatus
  busy: boolean
  availableEncoders: VideoEncoderId[]
  onChange: (settings: StreamSettings) => void
  onStart: () => void
  onStop: () => void
  onToggleDelay: () => void
  onOpenSettings: (tab?: 'stream' | 'encoder' | 'transition') => void
  embedded?: boolean
}

function formatDuration(startedAt: number | null, streaming: boolean): string {
  if (!streaming || !startedAt) return '00:00:00'
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function StreamPanel({
  settings,
  status,
  busy,
  onChange,
  onStart,
  onStop,
  onToggleDelay,
  onOpenSettings,
  embedded = false,
}: Props) {
  const encoderId = settings.encoder.videoEncoder ?? 'x264'
  const encoderInfo = getEncoderInfo(encoderId)
  const delayOn = Boolean(settings.streamDelayEnabled)
  const delaySec = settings.streamDelaySeconds || 10
  const shortLabel =
    encoderId === 'x264'
      ? 'x264'
      : encoderId === 'nvenc'
        ? 'NVENC'
        : encoderId === 'amf'
          ? 'AMF'
          : 'QSV'

  return (
    <div className={`panel ${embedded ? 'embedded' : ''}`}>
      {!embedded && <div className="panel-header">Stream</div>}
      <div className="panel-body">
        <div className="status-card">
          <div className="label">Status</div>
          <div className="value" style={{ color: status.streaming ? 'var(--live)' : undefined }}>
            {status.streaming ? 'Streaming' : 'Bereit'}
            {status.streaming && delayOn ? (
              <span className="delay-badge"> · Delay {delaySec}s</span>
            ) : null}
          </div>
          <div className="status-grid">
            <div>
              <div className="k">Dauer</div>
              <div className="v">{formatDuration(status.startedAt, status.streaming)}</div>
            </div>
            <div>
              <div className="k">Bitrate</div>
              <div className="v">
                {status.bitrateKbps != null ? `${status.bitrateKbps} kb/s` : '—'}
              </div>
            </div>
            <div>
              <div className="k">FPS</div>
              <div className="v">{status.fps != null ? status.fps.toFixed(0) : '—'}</div>
            </div>
            <div>
              <div className="k">Encoder</div>
              <div className="v">{shortLabel}</div>
            </div>
          </div>
        </div>

        {status.error && <div className="error-box">{status.error}</div>}

        <div className="field">
          <label htmlFor="key-quick">Stream-Key</label>
          <input
            id="key-quick"
            type="password"
            autoComplete="off"
            value={settings.streamKey}
            disabled={status.streaming}
            onChange={(e) => onChange({ ...settings, streamKey: e.target.value })}
            placeholder="Stream-Key einfügen"
          />
        </div>

        <div className="settings-summary" onClick={() => onOpenSettings('encoder')}>
          <div>
            <strong>{encoderInfo.label}</strong>
            <div className="transition-hint">
              {settings.encoder.resolution} · {settings.encoder.fps} FPS ·{' '}
              {settings.encoder.videoBitrate} kbps · {settings.encoder.preset}
            </div>
          </div>
          <button type="button" className="ghost" onClick={(e) => {
            e.stopPropagation()
            onOpenSettings('encoder')
          }}>
            Einstellen
          </button>
        </div>

        <div className="delay-row">
          <label htmlFor="delay-sec">Delay</label>
          <select
            id="delay-sec"
            value={delaySec}
            disabled={busy}
            onChange={(e) =>
              onChange({
                ...settings,
                streamDelaySeconds: Number(e.target.value) || 10,
              })
            }
          >
            {STREAM_DELAY_PRESETS.map((s) => (
              <option key={s} value={s}>
                {s} Sekunden
              </option>
            ))}
          </select>
          <button
            type="button"
            className={delayOn ? 'danger delay-toggle on' : 'primary delay-toggle'}
            disabled={busy || !settings.streamKey.trim()}
            title={
              status.streaming
                ? 'Delay live umschalten (kurzer Reconnect)'
                : 'Delay für den nächsten Stream vorbereiten'
            }
            onClick={onToggleDelay}
          >
            {delayOn ? `Delay aus (${delaySec}s)` : `Delay an (${delaySec}s)`}
          </button>
        </div>

        <div className="source-actions" style={{ marginTop: '0.75rem' }}>
          {!status.streaming ? (
            <button
              type="button"
              className="primary"
              style={{ flex: 1 }}
              disabled={busy || !settings.streamKey.trim()}
              onClick={onStart}
            >
              Stream starten
            </button>
          ) : (
            <button
              type="button"
              className="danger"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={onStop}
            >
              Stream stoppen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
