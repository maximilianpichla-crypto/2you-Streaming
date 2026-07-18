import type { AlertPayload } from './shared/types'

type AlertListener = (payload: AlertPayload) => void

const listeners = new Set<AlertListener>()

export function subscribeAlerts(listener: AlertListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitAlert(payload: AlertPayload): void {
  for (const listener of listeners) {
    listener(payload)
  }
}

/** Kurzer lokaler Beep – komplett offline */
export function playAlertBeep(volumePercent: number): void {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = Math.max(0, Math.min(1, volumePercent / 100)) * 0.18
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28)
    osc.stop(ctx.currentTime + 0.3)
    void ctx.resume()
    window.setTimeout(() => void ctx.close(), 400)
  } catch {
    // Audio nicht verfügbar – still ok
  }
}
