import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import type { StreamSource } from '../shared/types'
import { normalizeTransform, toFileUrl } from '../shared/types'

interface Props {
  source: StreamSource
  selected: boolean
  zIndex: number
  onSelect: () => void
  onTransformChange: (next: {
    xPercent: number
    yPercent: number
    widthPercent: number
    heightPercent: number
  }) => void
  frameRef: RefObject<HTMLDivElement | null>
}

type DragMode = 'move' | 'resize-se' | 'resize-sw' | 'resize-ne' | 'resize-nw'

export function SourceLayer({
  source,
  selected,
  zIndex,
  onSelect,
  onTransformChange,
  frameRef,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    orig: ReturnType<typeof normalizeTransform>
  } | null>(null)

  const transform = normalizeTransform(source.transform, source.type)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    setError(null)
    setReady(false)

    async function boot() {
      try {
        if (source.type === 'webcam' && source.deviceId) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: source.deviceId } },
            audio: false,
          })
        } else if (
          source.type === 'display' ||
          source.type === 'window' ||
          source.type === 'game'
        ) {
          const list =
            source.type === 'display'
              ? await window.twoYou.getDisplays()
              : await window.twoYou.getWindows()

          let sourceId = source.deviceId
          if (source.type === 'display') {
            const preferredIndex = source.deviceId ? Number(source.deviceId) : 0
            sourceId = list[preferredIndex]?.id || list[0]?.id
          } else if (!sourceId) {
            sourceId = list[0]?.id
          }
          if (!sourceId) {
            setError('Keine Quelle')
            return
          }
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: sourceId,
                  maxWidth: 1920,
                  maxHeight: 1080,
                  maxFrameRate: 30,
                },
              } as unknown as MediaTrackConstraints,
            })
          } catch {
            stream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: false,
            })
          }
        } else if (source.type === 'media' && source.settings?.filePath) {
          const url = toFileUrl(source.settings.filePath)
          if (videoRef.current) {
            videoRef.current.srcObject = null
            videoRef.current.src = url
            videoRef.current.loop = source.settings.loop ?? true
            await videoRef.current.play()
            setReady(true)
          }
          return
        } else {
          setReady(true)
          return
        }

        if (cancelled) {
          stream?.getTracks().forEach((t) => t.stop())
          return
        }
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setReady(true)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    void boot()
    return () => {
      cancelled = true
      if (videoRef.current) {
        videoRef.current.srcObject = null
        videoRef.current.removeAttribute('src')
      }
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [
    source.id,
    source.type,
    source.deviceId,
    source.settings?.filePath,
    source.settings?.loop,
  ])

  function startDrag(e: PointerEvent, mode: DragMode) {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    const frame = frameRef.current
    if (!frame) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...transform },
    }
  }

  function onPointerMove(e: PointerEvent) {
    const drag = dragRef.current
    const frame = frameRef.current
    if (!drag || !frame) return
    const rect = frame.getBoundingClientRect()
    const dx = ((e.clientX - drag.startX) / rect.width) * 100
    const dy = ((e.clientY - drag.startY) / rect.height) * 100
    const o = drag.orig

    if (drag.mode === 'move') {
      onTransformChange(
        normalizeTransform(
          {
            ...o,
            xPercent: o.xPercent + dx,
            yPercent: o.yPercent + dy,
          },
          source.type,
        ),
      )
      return
    }

    let { xPercent, yPercent, widthPercent, heightPercent } = o
    if (drag.mode === 'resize-se') {
      widthPercent = o.widthPercent + dx
      heightPercent = o.heightPercent + dy
    } else if (drag.mode === 'resize-sw') {
      widthPercent = o.widthPercent - dx
      heightPercent = o.heightPercent + dy
      xPercent = o.xPercent + dx
    } else if (drag.mode === 'resize-ne') {
      widthPercent = o.widthPercent + dx
      heightPercent = o.heightPercent - dy
      yPercent = o.yPercent + dy
    } else if (drag.mode === 'resize-nw') {
      widthPercent = o.widthPercent - dx
      heightPercent = o.heightPercent - dy
      xPercent = o.xPercent + dx
      yPercent = o.yPercent + dy
    }

    onTransformChange(
      normalizeTransform(
        { xPercent, yPercent, widthPercent, heightPercent },
        source.type,
      ),
    )
  }

  function endDrag(e: PointerEvent) {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const imagePath =
    source.type === 'image'
      ? source.settings?.filePath
      : source.type === 'slideshow'
        ? source.settings?.filePaths?.[0]
        : undefined

  const showVideo =
    source.type === 'webcam' ||
    source.type === 'display' ||
    source.type === 'window' ||
    source.type === 'game' ||
    source.type === 'media'

  return (
    <div
      className={`source-layer ${selected ? 'selected' : ''}`}
      style={{
        left: `${transform.xPercent}%`,
        top: `${transform.yPercent}%`,
        width: `${transform.widthPercent}%`,
        height: `${transform.heightPercent}%`,
        zIndex,
      }}
      onPointerDown={(e) => startDrag(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="source-layer-content">
        {showVideo && (
          <video ref={videoRef} muted playsInline className="source-layer-media" />
        )}
        {imagePath && (
          <img
            src={toFileUrl(imagePath)}
            alt=""
            className="source-layer-media"
            draggable={false}
          />
        )}
        {source.type === 'color' && (
          <div
            className="source-layer-fill"
            style={{ background: source.settings?.color ?? '#1a2332' }}
          />
        )}
        {source.type === 'browser' && source.settings?.url && (
          <iframe
            title={source.name}
            src={source.settings.url}
            className="source-layer-media"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        )}
        {source.type === 'text' && (
          <div
            className="source-layer-text"
            style={{
              fontSize: source.settings?.fontSize ?? 48,
              color: source.settings?.fontColor ?? '#ffffff',
            }}
          >
            {source.settings?.text ?? ''}
          </div>
        )}
        {source.type === 'scene' && (
          <div className="source-layer-placeholder">Verschachtelte Szene</div>
        )}
        {error && <div className="source-layer-error">{error}</div>}
        {!ready && !error && showVideo && (
          <div className="source-layer-placeholder">Lädt…</div>
        )}
      </div>

      {selected && (
        <>
          <div className="source-layer-label">{source.name}</div>
          <button
            type="button"
            className="source-handle nw"
            aria-label="Größe oben links"
            onPointerDown={(e) => startDrag(e, 'resize-nw')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          />
          <button
            type="button"
            className="source-handle ne"
            aria-label="Größe oben rechts"
            onPointerDown={(e) => startDrag(e, 'resize-ne')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          />
          <button
            type="button"
            className="source-handle sw"
            aria-label="Größe unten links"
            onPointerDown={(e) => startDrag(e, 'resize-sw')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          />
          <button
            type="button"
            className="source-handle se"
            aria-label="Größe unten rechts"
            onPointerDown={(e) => startDrag(e, 'resize-se')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          />
        </>
      )}
    </div>
  )
}
