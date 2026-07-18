import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/** Pfad zum WASAPI-Loopback-Helper (System-/Anwendungs-Audio) */
export function getWasapiCapturePath(): string {
  const candidates = [
    path.join(process.resourcesPath, 'wasapi-capture', 'audio_capture.exe'),
    path.join(app.getAppPath(), 'resources', 'wasapi-capture', 'audio_capture.exe'),
    path.join(process.cwd(), 'resources', 'wasapi-capture', 'audio_capture.exe'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[candidates.length - 1]
}

export function wasapiCaptureAvailable(): boolean {
  return fs.existsSync(getWasapiCapturePath())
}

/**
 * Argumente für PCM s16le 48 kHz Stereo auf stdout.
 * @param processIds null/undefined = gesamter Desktop; sonst nur diese PIDs
 */
export function buildWasapiCaptureArgs(
  processIds?: number[] | number | null,
): string[] {
  const args = [
    '--sample-rate',
    '48000',
    '--channels',
    '2',
    '--bit-depth',
    '16',
  ]
  const ids = Array.isArray(processIds)
    ? processIds.filter((n) => n > 0)
    : processIds && processIds > 0
      ? [processIds]
      : []
  if (ids.length > 0) {
    args.push('--include-processes', ...ids.map(String))
  }
  return args
}
