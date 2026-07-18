import { useEffect, useId, useRef, useState } from 'react'

interface Props {
  /** Browser- oder DShow-Gerätename (Mikrofon) */
  deviceId?: string
  deviceLabel?: string
  enabled: boolean
  /** 0–100 */
  volume: number
  onVolumeChange?: (volume: number) => void
  compact?: boolean
  /**
   * loopback = Desktop-/App-Audio über WASAPI (nicht Mikrofon)
   * device = getUserMedia / Mic
   */
  mode?: 'device' | 'loopback'
  /** App-Audio: Fenster-PID */
  processId?: number | null
  /** App-Audio: z. B. Spotify — alle Prozesse dieses Namens */
  processName?: string | null
}

async function resolveAudioConstraints(
  deviceId?: string,
  deviceLabel?: string,
): Promise<MediaStreamConstraints> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const audios = devices.filter((d) => d.kind === 'audioinput')
  const label = deviceLabel || deviceId || ''

  let match =
    audios.find((d) => d.deviceId === deviceId) ||
    (label
      ? audios.find(
          (d) =>
            d.label === label ||
            d.label.toLowerCase().includes(label.toLowerCase()) ||
            label.toLowerCase().includes(d.label.toLowerCase()),
        )
      : undefined)

  if (match) {
    return { audio: { deviceId: { exact: match.deviceId } }, video: false }
  }
  return { audio: true, video: false }
}

export function AudioLevelMeter({
  deviceId,
  deviceLabel,
  enabled,
  volume,
  onVolumeChange,
  compact = false,
  mode = 'device',
  processId = null,
  processName = null,
}: Props) {
  const reactId = useId()
  const meterId = `meter-${reactId}`
  const [level, setLevel] = useState(0)
  const [peak, setPeak] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const peakHold = useRef(0)
  const peakDecay = useRef(0)
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  // Lautstärke an WASAPI-Meter durchreichen
  useEffect(() => {
    if (mode !== 'loopback') return
    void window.twoYou.setLoopbackMeterVolume({ id: meterId, volume })
  }, [mode, meterId, volume])

  // WASAPI-Loopback-Pegel (Desktop / Spotify / …)
  useEffect(() => {
    if (mode !== 'loopback') return
    if (!enabled) {
      setLevel(0)
      setPeak(0)
      setError(null)
      void window.twoYou.stopLoopbackMeter(meterId)
      return
    }
    // App gewählt, aber noch keine PID/Name
    if (processId == null && !processName) {
      // Desktop-Loopback: beides null/leer ist ok — processId null + no name = desktop
      // Für app_audio kommt processId gesetzt. Desktop hat processId null und processName null.
    }

    let cancelled = false
    setError(null)

    const unsubLevel = window.twoYou.onLoopbackMeterLevel((payload) => {
      if (payload.id !== meterId || cancelled) return
      setLevel(payload.level)
      setPeak(payload.peak)
    })

    void window.twoYou
      .startLoopbackMeter({
        id: meterId,
        processId,
        processName,
        volume: volumeRef.current,
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Pegel fehlgeschlagen')
        }
      })

    return () => {
      cancelled = true
      unsubLevel()
      void window.twoYou.stopLoopbackMeter(meterId)
    }
  }, [mode, enabled, meterId, processId, processName])

  // Mikrofon-Pegel
  useEffect(() => {
    if (mode === 'loopback') return
    if (!enabled) {
      setLevel(0)
      setPeak(0)
      setError(null)
      return
    }

    if (!deviceId) {
      setLevel(0)
      setPeak(0)
      setError(null)
      return
    }

    let cancelled = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf = 0

    async function start() {
      setError(null)
      try {
        await window.twoYou.ensureMicPermission()
        const constraints = await resolveAudioConstraints(deviceId, deviceLabel)
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.75
        source.connect(analyser)

        const data = new Uint8Array(analyser.fftSize)

        const tick = () => {
          if (cancelled || !ctx) return
          analyser.getByteTimeDomainData(data)
          let sum = 0
          let max = 0
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128
            sum += v * v
            max = Math.max(max, Math.abs(v))
          }
          const rms = Math.sqrt(sum / data.length)
          const gain = Math.max(0, Math.min(1, volumeRef.current / 100))
          const instant = Math.min(1, rms * 2.4 * gain)
          const instantPeak = Math.min(1, max * 1.6 * gain)

          if (instantPeak >= peakHold.current) {
            peakHold.current = instantPeak
            peakDecay.current = 18
          } else if (peakDecay.current > 0) {
            peakDecay.current -= 1
          } else {
            peakHold.current = Math.max(0, peakHold.current - 0.012)
          }

          setLevel(instant)
          setPeak(peakHold.current)
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Kein Audio')
          setLevel(0)
          setPeak(0)
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close()
    }
  }, [mode, enabled, deviceId, deviceLabel])

  const pct = Math.round(level * 100)
  const peakPct = Math.round(peak * 100)
  const hot = level > 0.85
  const warn = level > 0.65 && !hot
  const inputId = `vol-${deviceId || processId || meterId}`

  return (
    <div
      className={`audio-meter ${compact ? 'compact' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="audio-meter-track" title={error ?? `Pegel ${pct}%`}>
        <div
          className={`audio-meter-fill ${warn ? 'warn' : ''} ${hot ? 'hot' : ''}`}
          style={{ width: `${pct}%` }}
        />
        <div className="audio-meter-peak" style={{ left: `${peakPct}%` }} />
      </div>
      {!compact && onVolumeChange && (
        <div className="audio-meter-volume">
          <label htmlFor={inputId}>Lautstärke</label>
          <input
            id={inputId}
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
          />
          <span>{volume}%</span>
        </div>
      )}
      {error && !compact && (
        <div className="audio-meter-error">{error}</div>
      )}
    </div>
  )
}

export function isAudioSourceType(
  type: string,
): type is 'microphone' | 'desktop_audio' | 'app_audio' {
  return type === 'microphone' || type === 'desktop_audio' || type === 'app_audio'
}
