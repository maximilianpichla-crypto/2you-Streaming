import type { CSSProperties } from 'react'
import type { AlertTextLayout, AlertTypeConfig } from '../shared/types'
import { toFileUrl } from '../shared/types'

interface Props {
  config: AlertTypeConfig
  title: string
  subtitle: string
  previewMode?: boolean
  className?: string
}

function textStyle(
  layout: AlertTextLayout,
  opts?: { display?: boolean },
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
    pointerEvents: 'none',
    textShadow: '0 1px 12px rgba(0,0,0,0.45)',
    fontFamily: opts?.display ? 'var(--font-display)' : 'var(--font-body)',
  }
}

export function AlertBox({
  config,
  title,
  subtitle,
  previewMode = false,
  className = '',
}: Props) {
  const media = config.media
  const mediaUrl =
    media.kind !== 'none' && media.filePath ? toFileUrl(media.filePath) : ''

  return (
    <div
      className={`alert-box ${previewMode ? 'is-preview' : `alert-anim-${config.animation}`} ${className}`.trim()}
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
          : 'transparent',
        background: config.showBackground ? undefined : 'transparent',
        backdropFilter: config.showBackground ? undefined : 'none',
        boxShadow: config.showBackground ? undefined : 'none',
      }}
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
          className={`alert-media ${previewMode ? 'alert-media-preview' : ''}`}
          src={mediaUrl}
          alt=""
          style={{
            left: `${media.xPercent}%`,
            top: `${media.yPercent}%`,
            width: `${media.widthPercent}%`,
            height: `${media.heightPercent}%`,
            objectFit: media.fit,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {mediaUrl && media.kind === 'video' && (
        <video
          className={`alert-media ${previewMode ? 'alert-media-preview' : ''}`}
          src={mediaUrl}
          autoPlay
          playsInline
          loop={media.loop}
          muted={media.muted}
          style={{
            left: `${media.xPercent}%`,
            top: `${media.yPercent}%`,
            width: `${media.widthPercent}%`,
            height: `${media.heightPercent}%`,
            objectFit: media.fit,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {config.titleLayout.visible && title.trim() && (
        <div
          className={`alert-title-el ${previewMode ? 'alert-text-preview' : ''}`}
          style={textStyle(config.titleLayout, { display: true })}
        >
          {title}
        </div>
      )}

      {config.subtitleLayout.visible && subtitle.trim() && (
        <div
          className={`alert-sub-el ${previewMode ? 'alert-text-preview' : ''}`}
          style={textStyle(config.subtitleLayout)}
        >
          {subtitle}
        </div>
      )}
    </div>
  )
}
