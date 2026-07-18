import { useEffect, useRef, useState, type DragEvent } from 'react'
import type {
  AlertsSettings,
  Scene,
  SourceTransform,
  TransitionSettings,
} from '../shared/types'
import { defaultAlerts, isVisualSource } from '../shared/types'
import { AlertOverlay } from './AlertOverlay'
import { SourceLayer } from './SourceLayer'

export interface DroppedCanvasImage {
  filePath: string
  name: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

interface Props {
  scene: Scene | undefined
  streaming: boolean
  transition: TransitionSettings
  alerts?: AlertsSettings
  selectedSourceId?: string | null
  onSelectSource?: (sourceId: string | null) => void
  onUpdateTransform?: (sourceId: string, transform: SourceTransform) => void
  onDropImages?: (images: DroppedCanvasImage[]) => void
  embedded?: boolean
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|svg)$/i
const DEFAULT_W = 28
const DEFAULT_H = 28

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return IMAGE_EXT.test(file.name)
}

function filePathOf(file: File): string | null {
  const withPath = file as File & { path?: string }
  if (withPath.path && withPath.path.length > 1) return withPath.path
  return null
}

export function PreviewPanel({
  scene,
  streaming,
  transition,
  alerts = defaultAlerts(),
  selectedSourceId = null,
  onSelectSource,
  onUpdateTransform,
  onDropImages,
  embedded = false,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const prevSceneId = useRef<string | undefined>(undefined)
  const [animClass, setAnimClass] = useState('')
  const [animKey, setAnimKey] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)

  const visualSources =
    scene?.sources.filter((s) => s.enabled && isVisualSource(s.type)) ?? []

  useEffect(() => {
    const id = scene?.id
    if (!id) return
    if (prevSceneId.current === undefined) {
      prevSceneId.current = id
      return
    }
    if (prevSceneId.current === id) return
    prevSceneId.current = id

    if (transition.type === 'cut') {
      setAnimClass('')
      return
    }

    setAnimClass(`tx tx-${transition.type}`)
    setAnimKey((k) => k + 1)
    const t = window.setTimeout(() => setAnimClass(''), transition.durationMs + 40)
    return () => window.clearTimeout(t)
  }, [scene?.id, transition.type, transition.durationMs])

  const durationStyle = {
    ['--tx-ms' as string]: `${transition.durationMs}ms`,
  }

  function dropPercent(clientX: number, clientY: number) {
    const frame = frameRef.current
    if (!frame) {
      return { xPercent: 36, yPercent: 36 }
    }
    const rect = frame.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100 - DEFAULT_W / 2
    const y = ((clientY - rect.top) / rect.height) * 100 - DEFAULT_H / 2
    return {
      xPercent: Math.min(100 - DEFAULT_W, Math.max(0, x)),
      yPercent: Math.min(100 - DEFAULT_H, Math.max(0, y)),
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = 0
    setDragOver(false)
    if (!onDropImages) return

    const files = [...e.dataTransfer.files].filter(isImageFile)
    if (files.length === 0) return

    const base = dropPercent(e.clientX, e.clientY)
    const images: DroppedCanvasImage[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      let filePath = filePathOf(file)
      if (!filePath) {
        const buffer = await file.arrayBuffer()
        filePath = await window.twoYou.saveDroppedFile({
          name: file.name,
          data: buffer,
        })
      }
      const offset = i * 4
      images.push({
        filePath,
        name: file.name.replace(/\.[^.]+$/, '') || file.name,
        xPercent: Math.min(100 - DEFAULT_W, base.xPercent + offset),
        yPercent: Math.min(100 - DEFAULT_H, base.yPercent + offset),
        widthPercent: DEFAULT_W,
        heightPercent: DEFAULT_H,
      })
    }

    onDropImages(images)
  }

  return (
    <div className={`preview-wrap ${embedded ? 'embedded' : ''}`}>
      <div className="preview-stage">
        <div
          key={animKey}
          ref={frameRef}
          className={`preview-frame ${animClass} ${dragOver ? 'drop-target' : ''}`}
          style={durationStyle}
          onPointerDown={() => onSelectSource?.(null)}
          onDragEnter={(e) => {
            e.preventDefault()
            dragDepth.current += 1
            if ([...e.dataTransfer.types].includes('Files')) setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            dragDepth.current = Math.max(0, dragDepth.current - 1)
            if (dragDepth.current === 0) setDragOver(false)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => void handleDrop(e)}
        >
          <div className="preview-content preview-canvas">
            {visualSources.length === 0 && !dragOver && (
              <div className="preview-placeholder">
                Bild hierher ziehen oder eine Quelle aktivieren.
              </div>
            )}
            {visualSources.map((source, index) => (
              <SourceLayer
                key={source.id}
                source={source}
                selected={selectedSourceId === source.id}
                zIndex={index + 1}
                frameRef={frameRef}
                onSelect={() => onSelectSource?.(source.id)}
                onTransformChange={(transform) =>
                  onUpdateTransform?.(source.id, transform)
                }
              />
            ))}
            {dragOver && (
              <div className="drop-overlay" aria-hidden>
                <div className="drop-overlay-card">Bilder hier ablegen</div>
              </div>
            )}
          </div>
          <div className="tx-veil" aria-hidden />
          <AlertOverlay alerts={alerts} />
        </div>
      </div>
      <div className="preview-toolbar">
        <span className={`live-dot ${streaming ? 'on' : ''}`} />
        <span>{streaming ? 'Live' : 'Vorschau'}</span>
        <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
          {transition.type !== 'cut' ? `· ${transition.type}` : ''}
        </span>
        <span style={{ color: 'var(--text-muted)', marginLeft: '0.75rem' }}>
          Drag & Drop · ziehen · skalieren
        </span>
        <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {scene?.name ?? '—'}
        </span>
      </div>
    </div>
  )
}
