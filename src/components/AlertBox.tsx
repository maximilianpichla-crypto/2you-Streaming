import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { AlertTextLayout, AlertTypeConfig } from '../shared/types'
import { toFileUrl } from '../shared/types'

export type AlertEditLayer = 'frame' | 'media' | 'title' | 'subtitle'

interface Props {
  config: AlertTypeConfig
  title: string
  subtitle: string
  previewMode?: boolean
  className?: string
  /** Interaktiv: Elemente in der Vorschau verschieben */
  editable?: boolean
  selectedLayer?: AlertEditLayer | null
  onSelectLayer?: (layer: AlertEditLayer) => void
  onMoveLayer?: (
    layer: AlertEditLayer,
    xPercent: number,
    yPercent: number,
  ) => void
}

function textStyle(
  layout: AlertTextLayout,
  opts?: { display?: boolean; interactive?: boolean },
): CSSProperties {
  const translateX =
    layout.align === 'center' ? '-50%' : layout.align === 'right' ? '-100%' : '0'
  return {
    position: 'absolute',
    left: `${layout.xPercent}%`,
    top: `${layout.yPercent}%`,
    transform: `translate(${translateX}, -50%)`,
    width: `${layout.maxWidthPercent}%`,
    maxWidth: `${layout.maxWidthPercent}%`,
    fontSize: layout.fontSize,
    color: layout.color,
    fontWeight: layout.bold ? 700 : 500,
    textAlign: layout.align,
    lineHeight: 1.2,
    letterSpacing: layout.bold ? '-0.02em' : '0',
    wordBreak: 'break-word',
    pointerEvents: opts?.interactive ? 'auto' : 'none',
    cursor: opts?.interactive ? 'grab' : undefined,
    textShadow: '0 1px 12px rgba(0,0,0,0.45)',
    fontFamily: opts?.display ? 'var(--font-display)' : 'var(--font-body)',
    userSelect: 'none',
  }
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n))
}

export function AlertBox({
  config,
  title,
  subtitle,
  previewMode = false,
  className = '',
  editable = false,
  selectedLayer = null,
  onSelectLayer,
  onMoveLayer,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{
    layer: AlertEditLayer
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)

  const media = config.media
  const mediaUrl =
    media.kind !== 'none' && media.filePath ? toFileUrl(media.filePath) : ''
  const interactive = Boolean(editable && previewMode)

  const resolveCanvas = useCallback(() => {
    const box = boxRef.current
    if (!box) return null
    return (box.parentElement as HTMLElement) ?? null
  }, [])

  const beginDrag = (
    e: ReactPointerEvent,
    layer: AlertEditLayer,
    origX: number,
    origY: number,
  ) => {
    if (!interactive || !onMoveLayer) return
    e.preventDefault()
    e.stopPropagation()
    onSelectLayer?.(layer)
    canvasRef.current = resolveCanvas()
    dragRef.current = {
      layer,
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
    }
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag || !onMoveLayer) return

    if (drag.layer === 'frame') {
      const canvas = canvasRef.current ?? resolveCanvas()
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const dx = ((e.clientX - drag.startX) / rect.width) * 100
      const dy = ((e.clientY - drag.startY) / rect.height) * 100
      onMoveLayer(
        'frame',
        clamp(drag.origX + dx),
        clamp(drag.origY + dy),
      )
      return
    }

    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const dx = ((e.clientX - drag.startX) / rect.width) * 100
    const dy = ((e.clientY - drag.startY) / rect.height) * 100
    onMoveLayer(
      drag.layer,
      clamp(drag.origX + dx),
      clamp(drag.origY + dy),
    )
  }

  const endDrag = (e: ReactPointerEvent) => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const layerClass = (layer: AlertEditLayer) =>
    [
      interactive ? 'alert-layer-editable' : '',
      selectedLayer === layer ? 'is-selected' : '',
      dragging && selectedLayer === layer ? 'is-dragging' : '',
    ]
      .filter(Boolean)
      .join(' ')

  return (
    <div
      ref={boxRef}
      className={`alert-box ${previewMode ? 'is-preview' : `alert-anim-${config.animation}`} ${interactive ? 'is-editable' : ''} ${className}`.trim()}
      style={{
        left: `${config.boxXPercent}%`,
        top: `${config.boxYPercent}%`,
        width: `${config.boxWidthPercent}%`,
        height: `${config.boxHeightPercent}%`,
        transform: 'translate(-50%, -50%)',
        ['--alert-accent' as string]: config.accentColor,
        ['--alert-bg' as string]: config.showBackground
          ? config.bgColor
          : 'transparent',
        ['--alert-ms' as string]: `${Math.min(config.durationMs, 900)}ms`,
        ['--alert-hold' as string]: `${config.durationMs}ms`,
        borderColor: config.showBackground
          ? `color-mix(in srgb, ${config.accentColor} 35%, transparent)`
          : interactive
            ? 'color-mix(in srgb, var(--accent) 40%, transparent)'
            : 'transparent',
        background: config.showBackground ? undefined : 'transparent',
        backdropFilter: config.showBackground ? undefined : 'none',
        boxShadow: config.showBackground ? undefined : 'none',
        cursor: interactive ? 'move' : undefined,
      }}
      onPointerDown={(e) => {
        if (!interactive) return
        // Leerer Rahmen → Rahmen verschieben
        if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('alert-sheen') && !(e.target as HTMLElement).classList.contains('alert-accent-bar')) {
          return
        }
        beginDrag(e, 'frame', config.boxXPercent, config.boxYPercent)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {config.showBackground && (
        <>
          <div className="alert-sheen" />
          <div className="alert-accent-bar" />
          {!previewMode && <div className="alert-progress" />}
        </>
      )}

      {mediaUrl && media.kind === 'image' && (
        <img
          className={`alert-media ${previewMode ? 'alert-media-preview' : ''} ${layerClass('media')}`}
          src={mediaUrl}
          alt=""
          draggable={false}
          style={{
            left: `${media.xPercent}%`,
            top: `${media.yPercent}%`,
            width: `${media.widthPercent}%`,
            height: `${media.heightPercent}%`,
            objectFit: media.fit,
            transform: 'translate(-50%, -50%)',
            pointerEvents: interactive ? 'auto' : 'none',
            cursor: interactive ? 'grab' : undefined,
          }}
          onPointerDown={(e) =>
            beginDrag(e, 'media', media.xPercent, media.yPercent)
          }
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      )}

      {mediaUrl && media.kind === 'video' && (
        <video
          className={`alert-media ${previewMode ? 'alert-media-preview' : ''} ${layerClass('media')}`}
          src={mediaUrl}
          autoPlay
          playsInline
          loop={media.loop}
          muted={media.muted}
          draggable={false}
          style={{
            left: `${media.xPercent}%`,
            top: `${media.yPercent}%`,
            width: `${media.widthPercent}%`,
            height: `${media.heightPercent}%`,
            objectFit: media.fit,
            transform: 'translate(-50%, -50%)',
            pointerEvents: interactive ? 'auto' : 'none',
            cursor: interactive ? 'grab' : undefined,
          }}
          onPointerDown={(e) =>
            beginDrag(e, 'media', media.xPercent, media.yPercent)
          }
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      )}

      {config.titleLayout.visible && title.trim() && (
        <div
          className={`alert-title-el ${previewMode ? 'alert-text-preview' : ''} ${layerClass('title')}`}
          style={textStyle(config.titleLayout, {
            display: true,
            interactive,
          })}
          onPointerDown={(e) =>
            beginDrag(
              e,
              'title',
              config.titleLayout.xPercent,
              config.titleLayout.yPercent,
            )
          }
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {title}
        </div>
      )}

      {config.subtitleLayout.visible && subtitle.trim() && (
        <div
          className={`alert-sub-el ${previewMode ? 'alert-text-preview' : ''} ${layerClass('subtitle')}`}
          style={textStyle(config.subtitleLayout, { interactive })}
          onPointerDown={(e) =>
            beginDrag(
              e,
              'subtitle',
              config.subtitleLayout.xPercent,
              config.subtitleLayout.yPercent,
            )
          }
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {subtitle}
        </div>
      )}
    </div>
  )
}
