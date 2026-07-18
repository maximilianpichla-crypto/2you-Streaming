import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import {
  EncoderSettings,
  Scene,
  StreamSettings,
  StreamSource,
  StreamStatus,
  VideoEncoderId,
  getEncoderInfo,
  isVisualSource,
  normalizeEncoderSettings,
  normalizeTransform,
  resolveRtmpUrl,
} from '../src/shared/types'

import {
  buildWasapiCaptureArgs,
  getWasapiCapturePath,
  wasapiCaptureAvailable,
} from './wasapiCapture'
import { resolveLoopbackPids } from './loopbackMeter'

export type BuiltFfmpegPlan = {
  args: string[]
  loopback?: {
    mode: 'desktop' | 'app'
    processId?: number
    processName?: string
  }
}

export type StatusListener = (status: StreamStatus) => void
export function getFfmpegPath(): string {
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
    : path.join(app.getAppPath(), 'resources', 'ffmpeg', 'ffmpeg.exe')

  if (fs.existsSync(bundled)) return bundled
  return 'ffmpeg'
}

export async function listDshowDevices(): Promise<{
  video: string[]
  audio: string[]
}> {
  const ffmpegPath = getFfmpegPath()
  return new Promise((resolve) => {
    const video: string[] = []
    const audio: string[] = []
    const child = spawn(
      ffmpegPath,
      ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
      { windowsHide: true },
    )
    let out = ''
    child.stderr.on('data', (buf: Buffer) => {
      out += buf.toString('utf8')
    })
    child.on('close', () => {
      const lines = out.split(/\r?\n/)
      for (const line of lines) {
        const match = line.match(/"([^"]+)"\s+\((audio|video)\)/i)
        if (!match) continue
        const name = match[1]
        const kind = match[2].toLowerCase()
        if (kind === 'audio') audio.push(name)
        else video.push(name)
      }
      resolve({ video, audio })
    })
    child.on('error', () => resolve({ video: [], audio: [] }))
  })
}

/** Welche H.264-Encoder FFmpeg auf diesem System anbietet */
export async function detectAvailableEncoders(): Promise<VideoEncoderId[]> {
  const ffmpegPath = getFfmpegPath()
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-encoders'], {
      windowsHide: true,
    })
    let out = ''
    child.stdout.on('data', (buf: Buffer) => {
      out += buf.toString('utf8')
    })
    child.stderr.on('data', (buf: Buffer) => {
      out += buf.toString('utf8')
    })
    child.on('close', () => {
      const available: VideoEncoderId[] = ['x264']
      if (/^\s*.*h264_nvenc\b/m.test(out) || /\bh264_nvenc\b/.test(out)) {
        available.push('nvenc')
      }
      if (/\bh264_amf\b/.test(out)) available.push('amf')
      if (/\bh264_qsv\b/.test(out)) available.push('qsv')
      // libx264 always preferred as software fallback
      if (!/\blibx264\b/.test(out) && available[0] === 'x264') {
        // keep x264 anyway – most builds have it
      }
      resolve(available)
    })
    child.on('error', () => resolve(['x264']))
  })
}

function buildVideoEncoderArgs(encoder: EncoderSettings, fps: number): string[] {
  const enc = {
    ...encoder,
    // In Simple-Mode feste, stream-sichere Defaults
    ...(encoder.outputMode !== 'advanced'
      ? {
          rateControl: 'cbr' as const,
          keyframeIntervalSec: 2,
          profile: 'high' as const,
          bframes: encoder.videoEncoder === 'x264' ? 0 : 2,
          bufsizeMultiplier: 2,
          tune: 'auto',
        }
      : {}),
  }

  const info = getEncoderInfo(enc.videoEncoder)
  const preset = enc.preset || info.defaultPreset
  const vBitrate = `${enc.videoBitrate}k`
  const maxrate =
    enc.rateControl === 'vbr'
      ? `${Math.round(enc.videoBitrate * 1.35)}k`
      : vBitrate
  const bufsize = `${Math.round(enc.videoBitrate * (enc.bufsizeMultiplier || 2))}k`
  const gop = String(Math.max(1, Math.round(fps * (enc.keyframeIntervalSec || 2))))
  const profile = enc.profile || 'high'
  const bf = Math.max(0, enc.bframes ?? 0)
  const args: string[] = []

  const x264Tune =
    enc.tune === 'none'
      ? null
      : enc.tune === 'auto' || !enc.tune
        ? 'zerolatency'
        : enc.tune
  const nvencTune =
    enc.tune === 'none'
      ? null
      : enc.tune === 'hq'
        ? 'hq'
        : enc.tune === 'll' || enc.tune === 'auto' || !enc.tune
          ? 'll'
          : enc.tune

  switch (enc.videoEncoder) {
    case 'nvenc': {
      args.push('-c:v', 'h264_nvenc', '-preset', preset)
      if (nvencTune) args.push('-tune', nvencTune)
      if (enc.rateControl === 'crf') {
        args.push('-rc', 'constqp', '-qp', String(enc.crf))
      } else if (enc.rateControl === 'vbr') {
        args.push(
          '-rc',
          'vbr',
          '-b:v',
          vBitrate,
          '-maxrate',
          maxrate,
          '-bufsize',
          bufsize,
        )
      } else {
        args.push(
          '-rc',
          'cbr',
          '-b:v',
          vBitrate,
          '-maxrate',
          vBitrate,
          '-bufsize',
          bufsize,
        )
      }
      args.push(
        '-profile:v',
        profile,
        '-bf',
        String(bf),
        '-pix_fmt',
        'yuv420p',
        '-g',
        gop,
      )
      break
    }
    case 'amf': {
      args.push('-c:v', 'h264_amf', '-quality', preset)
      if (enc.rateControl === 'crf') {
        args.push('-rc', 'cqp', '-qp_i', String(enc.crf), '-qp_p', String(enc.crf))
      } else if (enc.rateControl === 'vbr') {
        args.push(
          '-rc',
          'vbr_latency',
          '-b:v',
          vBitrate,
          '-maxrate',
          maxrate,
          '-bufsize',
          bufsize,
        )
      } else {
        args.push(
          '-rc',
          'cbr',
          '-b:v',
          vBitrate,
          '-maxrate',
          vBitrate,
          '-bufsize',
          bufsize,
        )
      }
      args.push('-profile:v', profile, '-pix_fmt', 'yuv420p', '-g', gop)
      break
    }
    case 'qsv': {
      args.push('-c:v', 'h264_qsv', '-preset', preset)
      if (enc.rateControl === 'crf') {
        args.push('-global_quality', String(enc.crf))
      } else {
        args.push('-b:v', vBitrate, '-maxrate', maxrate, '-bufsize', bufsize)
      }
      args.push(
        '-profile:v',
        profile,
        '-bf',
        String(bf),
        '-pix_fmt',
        'yuv420p',
        '-g',
        gop,
      )
      break
    }
    case 'x264':
    default: {
      args.push('-c:v', 'libx264', '-preset', preset)
      if (x264Tune) args.push('-tune', x264Tune)
      if (enc.rateControl === 'crf') {
        args.push('-crf', String(enc.crf))
      } else {
        args.push('-b:v', vBitrate, '-maxrate', maxrate, '-bufsize', bufsize)
      }
      args.push(
        '-profile:v',
        profile,
        '-bf',
        String(bf),
        '-pix_fmt',
        'yuv420p',
        '-g',
        gop,
      )
      break
    }
  }

  return args
}

function parseResolution(res: string): { w: number; h: number } {
  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(String(res || '').trim())
  if (!match) return { w: 1920, h: 1080 }
  const w = Number(match[1])
  const h = Number(match[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16) {
    return { w: 1920, h: 1080 }
  }
  return { w, h }
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
}

function escapePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:')
}

function hexToFfmpegColor(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length === 6) return `0x${h}`
  return '0x1a2332'
}

/**
 * Build FFmpeg args: black canvas + layered sources with transform overlays.
 * Desktop-/App-Audio: WASAPI-Helper → pipe:0 (nicht Mikrofon/dshow).
 */
export function buildFfmpegArgs(options: {
  settings: StreamSettings
  scene: Scene
  audioSources: StreamSource[]
  displayIndex: number
}): BuiltFfmpegPlan {
  const { settings: rawSettings, scene, audioSources, displayIndex } = options
  const encoder = normalizeEncoderSettings(rawSettings.encoder)
  const settings = { ...rawSettings, encoder }
  const { w, h } = parseResolution(encoder.resolution)
  const fps = encoder.fps
  const aBitrate = `${encoder.audioBitrate}k`
  const aRate = encoder.audioSampleRate
  const aCh = encoder.audioChannels
  const aLayout = aCh === 1 ? 'mono' : 'stereo'

  const enabledVisual = scene.sources.filter(
    (s) => s.enabled && isVisualSource(s.type),
  )
  const visual = enabledVisual
  const enabledAudio = (audioSources ?? []).filter((s) => s.enabled)
  const mic = enabledAudio.find((s) => s.type === 'microphone')
  const desktopAudio = enabledAudio.find((s) => s.type === 'desktop_audio')
  const appAudio = enabledAudio.find((s) => s.type === 'app_audio')
  const loopbackSource = appAudio ?? desktopAudio
  const useWasapiLoopback = Boolean(loopbackSource) && wasapiCaptureAvailable()

  const rtmpBase = resolveRtmpUrl(settings)
  const key = settings.streamKey.trim()
  if (!rtmpBase) throw new Error('RTMP-URL fehlt')
  if (!key) throw new Error('Stream-Key fehlt')
  const rtmpUrl = `${rtmpBase.replace(/\/$/, '')}/${key}`

  const args: string[] = ['-hide_banner', '-loglevel', 'info', '-stats', '-y']
  let inputIndex = 0
  const filterParts: string[] = []

  args.push(
    '-f',
    'lavfi',
    '-i',
    `color=c=0x000000:s=${w}x${h}:r=${fps}`,
  )
  const baseInput = inputIndex++
  filterParts.push(`[${baseInput}:v]format=yuv420p,setsar=1[base]`)
  let current = 'base'
  let layer = 0

  function pushOverlay(source: StreamSource, inIdx: number, opts?: { isImage?: boolean }) {
    const t = normalizeTransform(source.transform, source.type)
    const ow = Math.max(2, Math.round((t.widthPercent / 100) * w))
    const oh = Math.max(2, Math.round((t.heightPercent / 100) * h))
    const ox = Math.round((t.xPercent / 100) * w)
    const oy = Math.round((t.yPercent / 100) * h)
    const scaled = `l${layer}`
    const next = `c${layer}`
    const scaleFilter = opts?.isImage
      ? `[${inIdx}:v]scale=${ow}:${oh}:force_original_aspect_ratio=decrease,pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2,format=rgba[${scaled}]`
      : `[${inIdx}:v]scale=${ow}:${oh}:force_original_aspect_ratio=decrease,pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[${scaled}]`
    filterParts.push(scaleFilter)
    filterParts.push(
      `[${current}][${scaled}]overlay=${ox}:${oy}:format=auto[${next}]`,
    )
    current = next
    layer++
  }

  for (const source of visual) {
    if (source.type === 'browser' || source.type === 'scene') continue

    if (source.type === 'text' && source.settings?.text) {
      const t = normalizeTransform(source.transform, source.type)
      const ox = Math.round((t.xPercent / 100) * w)
      const oy = Math.round((t.yPercent / 100) * h)
      const txt = escapeDrawtext(source.settings.text)
      const fs = source.settings.fontSize ?? 48
      const fc = (source.settings.fontColor ?? '#ffffff').replace('#', '')
      const next = `c${layer}`
      filterParts.push(
        `[${current}]drawtext=text='${txt}':fontsize=${fs}:fontcolor=0x${fc}:x=${ox}:y=${oy}[${next}]`,
      )
      current = next
      layer++
      continue
    }

    if (source.type === 'color') {
      const c = hexToFfmpegColor(source.settings?.color ?? '#1a2332')
      const t = normalizeTransform(source.transform, source.type)
      const ow = Math.max(2, Math.round((t.widthPercent / 100) * w))
      const oh = Math.max(2, Math.round((t.heightPercent / 100) * h))
      args.push('-f', 'lavfi', '-i', `color=c=${c}:s=${ow}x${oh}:r=${fps}`)
      const idx = inputIndex++
      const next = `c${layer}`
      const ox = Math.round((t.xPercent / 100) * w)
      const oy = Math.round((t.yPercent / 100) * h)
      filterParts.push(
        `[${current}][${idx}:v]overlay=${ox}:${oy}:format=auto[${next}]`,
      )
      current = next
      layer++
      continue
    }

    if (source.type === 'display') {
      const drawMouse = source.settings?.captureCursor === false ? '0' : '1'
      args.push(
        '-f',
        'gdigrab',
        '-framerate',
        String(fps),
        '-draw_mouse',
        drawMouse,
        '-i',
        'desktop',
      )
      void displayIndex
      pushOverlay(source, inputIndex++)
      continue
    }

    if (source.type === 'window' || source.type === 'game') {
      const title =
        source.settings?.windowTitle || source.deviceLabel || source.name
      args.push(
        '-f',
        'gdigrab',
        '-framerate',
        String(fps),
        '-draw_mouse',
        source.settings?.captureCursor === false ? '0' : '1',
        '-i',
        `title=${title}`,
      )
      pushOverlay(source, inputIndex++)
      continue
    }

    if (source.type === 'webcam') {
      const name = source.deviceLabel || source.deviceId || ''
      if (!name) continue
      args.push(
        '-f',
        'dshow',
        '-framerate',
        String(Math.min(fps, 30)),
        '-i',
        `video=${name}`,
      )
      pushOverlay(source, inputIndex++)
      continue
    }

    if (source.type === 'media' && source.settings?.filePath) {
      if (source.settings.loop) args.push('-stream_loop', '-1')
      args.push('-re', '-i', source.settings.filePath)
      pushOverlay(source, inputIndex++)
      continue
    }

    if (source.type === 'image' && source.settings?.filePath) {
      args.push('-loop', '1', '-framerate', String(fps), '-i', source.settings.filePath)
      pushOverlay(source, inputIndex++, { isImage: true })
      continue
    }

    if (source.type === 'slideshow' && source.settings?.filePaths?.[0]) {
      args.push(
        '-loop',
        '1',
        '-framerate',
        String(fps),
        '-i',
        source.settings.filePaths[0],
      )
      pushOverlay(source, inputIndex++, { isImage: true })
    }
  }

  filterParts.push(`[${current}]null[vout]`)

  type AudioTrack = { index: number; volume: number }
  const audioTracks: AudioTrack[] = []

  const micName = mic?.deviceLabel || mic?.deviceId || ''
  if (mic && micName) {
    args.push('-f', 'dshow', '-thread_queue_size', '1024', '-i', `audio=${micName}`)
    audioTracks.push({
      index: inputIndex++,
      volume: Math.max(0, Math.min(100, mic.settings?.volume ?? 100)) / 100,
    })
  }

  let loopback: BuiltFfmpegPlan['loopback']

  if (loopbackSource && useWasapiLoopback) {
    args.push(
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-thread_queue_size',
      '2048',
      '-i',
      'pipe:0',
    )
    audioTracks.push({
      index: inputIndex++,
      volume:
        Math.max(0, Math.min(100, loopbackSource.settings?.volume ?? 100)) / 100,
    })
    if (loopbackSource.type === 'app_audio') {
      const processId =
        loopbackSource.settings?.processId ??
        (Number.parseInt(String(loopbackSource.deviceId ?? ''), 10) || undefined)
      const processName = loopbackSource.settings?.processName
      if (!processId && !processName) {
        throw new Error(
          'Anwendungsaudio: Bitte eine Anwendung / ein Fenster wählen.',
        )
      }
      loopback = { mode: 'app', processId, processName }
    } else {
      loopback = { mode: 'desktop' }
    }
  } else if (loopbackSource && !useWasapiLoopback) {
    throw new Error(
      'Desktop-/Anwendungsaudio: WASAPI-Helper fehlt (resources/wasapi-capture).',
    )
  }

  if (audioTracks.length === 0) {
    args.push(
      '-f',
      'lavfi',
      '-i',
      `anullsrc=channel_layout=${aLayout}:sample_rate=${aRate}`,
    )
    audioTracks.push({ index: inputIndex++, volume: 1 })
  }

  const aFormat = `aformat=sample_fmts=fltp:sample_rates=${aRate}:channel_layouts=${aLayout}`

  if (audioTracks.length === 1) {
    const t = audioTracks[0]
    filterParts.push(
      `[${t.index}:a]${aFormat},volume=${t.volume}[aout]`,
    )
  } else {
    const labels = audioTracks.map((t, idx) => {
      filterParts.push(
        `[${t.index}:a]${aFormat},volume=${t.volume}[a${idx}]`,
      )
      return `[a${idx}]`
    })
    filterParts.push(
      `${labels.join('')}amix=inputs=${audioTracks.length}:duration=longest:dropout_transition=2[aout]`,
    )
  }

  args.push('-filter_complex', filterParts.join(';'))
  args.push('-map', '[vout]', '-map', '[aout]')
  args.push(...buildVideoEncoderArgs(encoder, fps))
  args.push(
    '-c:a',
    'aac',
    '-b:a',
    aBitrate,
    '-ar',
    String(aRate),
    '-ac',
    String(aCh),
    '-shortest',
    '-f',
    'flv',
    rtmpUrl,
  )

  void escapePath
  return { args, loopback }
}


export class FfmpegStreamer {
  private process: ChildProcessWithoutNullStreams | null = null
  private captureProcess: ChildProcessWithoutNullStreams | null = null
  private listener: StatusListener | null = null
  private status: StreamStatus = {
    streaming: false,
    startedAt: null,
    bitrateKbps: null,
    fps: null,
    error: null,
    lastLogLine: null,
  }

  onStatus(listener: StatusListener): void {
    this.listener = listener
  }

  getStatus(): StreamStatus {
    return { ...this.status }
  }

  private emit(): void {
    this.listener?.(this.getStatus())
  }

  private setPartial(partial: Partial<StreamStatus>): void {
    this.status = { ...this.status, ...partial }
    this.emit()
  }

  private stopCapture(): void {
    const cap = this.captureProcess
    this.captureProcess = null
    if (!cap) return
    try {
      cap.kill()
    } catch {
      /* ignore */
    }
  }

  async start(options: {
    settings: StreamSettings
    scene: Scene
    audioSources: StreamSource[]
    displayIndex: number
  }): Promise<void> {
    if (this.process) {
      throw new Error('Stream läuft bereits')
    }

    const ffmpegPath = getFfmpegPath()
    if (ffmpegPath !== 'ffmpeg' && !fs.existsSync(ffmpegPath)) {
      throw new Error(
        'FFmpeg nicht gefunden. Bitte npm run fetch-ffmpeg ausführen.',
      )
    }

    const plan = buildFfmpegArgs(options)
    const { args, loopback } = plan
    const needsLoopback = Boolean(loopback)

    this.setPartial({
      streaming: true,
      startedAt: Date.now(),
      bitrateKbps: null,
      fps: null,
      error: null,
      lastLogLine: null,
    })

    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.process = child

    if (needsLoopback && loopback) {
      const capturePath = getWasapiCapturePath()
      if (!fs.existsSync(capturePath)) {
        child.kill()
        this.process = null
        throw new Error('WASAPI-Capture nicht gefunden')
      }
      const pids =
        loopback.mode === 'desktop'
          ? null
          : await resolveLoopbackPids({
              processId: loopback.processId,
              processName: loopback.processName,
            })
      if (loopback.mode === 'app' && (!pids || pids.length === 0)) {
        child.kill()
        this.process = null
        throw new Error(
          'Anwendungsaudio: Keine Prozesse gefunden (App neu wählen?).',
        )
      }
      const cap = spawn(capturePath, buildWasapiCaptureArgs(pids), {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.captureProcess = cap
      cap.stdout.pipe(child.stdin)
      cap.stderr.on('data', (buf: Buffer) => {
        const line = buf.toString('utf8').trim()
        if (line)
          this.setPartial({ lastLogLine: `[wasapi] ${line.slice(0, 200)}` })
      })
      cap.on('error', (err) => {
        this.setPartial({ error: `WASAPI: ${err.message}` })
      })
      cap.on('close', () => {
        this.captureProcess = null
      })
    }
    const onData = (buf: Buffer) => {
      const text = buf.toString('utf8')
      const lines = text.split(/\r?\n/).filter(Boolean)
      for (const line of lines) {
        this.parseLogLine(line)
      }
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('error', (err) => {
      this.stopCapture()
      this.process = null
      this.setPartial({
        streaming: false,
        error: err.message,
        startedAt: null,
      })
    })

    child.on('close', (code) => {
      this.stopCapture()
      this.process = null
      const errored = Boolean(code && code !== 0)
      this.setPartial({
        streaming: false,
        startedAt: null,
        error: errored
          ? this.status.error || `FFmpeg beendet mit Code ${code}`
          : null,
      })
    })
  }

  stop(): void {
    this.stopCapture()
    if (!this.process) {
      this.setPartial({ streaming: false, startedAt: null })
      return
    }
    const proc = this.process
    try {
      // Bei Loopback ist stdin PCM — kein 'q'
      proc.kill()
    } catch {
      // ignore
    }
    this.process = null
    this.setPartial({ streaming: false, startedAt: null })
  }

  private parseLogLine(line: string): void {
    this.setPartial({ lastLogLine: line })

    const fpsMatch = line.match(/fps=\s*([\d.]+)/)
    const brMatch = line.match(/bitrate=\s*([\d.]+)kbits\/s/)
    const partial: Partial<StreamStatus> = {}
    if (fpsMatch) partial.fps = Number(fpsMatch[1])
    if (brMatch) partial.bitrateKbps = Math.round(Number(brMatch[1]))
    if (Object.keys(partial).length) {
      this.setPartial(partial)
    }

    if (/Could not find|No such|Connection refused|Server error|Error opening/i.test(line)) {
      this.setPartial({ error: line })
    }
  }
}
