import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { PanelId, UiLayout } from '../shared/types'
import {
  PANEL_LABELS,
  defaultUiLayout,
  normalizeUiLayout,
} from '../shared/types'

interface Props {
  layout: UiLayout
  onChange: (layout: UiLayout) => void
  renderPanel: (id: PanelId) => ReactNode
}

type DragPayload =
  | { type: 'panel'; panelId: PanelId; fromCol: number; fromRow: number }
  | null

export function FlexibleWorkspace({ layout, onChange, renderPanel }: Props) {
  const normalized = normalizeUiLayout(layout)
  const dragRef = useRef<DragPayload>(null)
  const [dropHint, setDropHint] = useState<{
    col: number
    row: number
  } | null>(null)
  const resizeRef = useRef<{
    kind: 'col' | 'row'
    colIndex: number
    rowIndex?: number
    startPos: number
    startLayout: UiLayout
  } | null>(null)

  function commit(next: UiLayout) {
    onChange(normalizeUiLayout(next))
  }

  function movePanel(panelId: PanelId, toCol: number, toRow: number) {
    let movedHeight = 50
    const cols = normalized.columns
      .map((c) => ({
        ...c,
        panels: c.panels.filter((p) => {
          if (p.id !== panelId) return true
          movedHeight = p.heightPercent
          return false
        }),
      }))
      .filter((c) => c.panels.length > 0)

    if (toCol >= cols.length) {
      cols.push({
        id: `col-${Date.now()}`,
        widthPercent: 22,
        panels: [{ id: panelId, heightPercent: 100 }],
      })
    } else {
      const targetIndex = Math.max(0, Math.min(toCol, cols.length - 1))
      const target = cols[targetIndex]
      const insertAt = Math.max(0, Math.min(toRow, target.panels.length))
      target.panels.splice(insertAt, 0, {
        id: panelId,
        heightPercent: movedHeight,
      })
      const eq = 100 / target.panels.length
      target.panels = target.panels.map((p) => ({ ...p, heightPercent: eq }))
    }

    const w = 100 / cols.length
    commit({
      columns: cols.map((c) => ({ ...c, widthPercent: w })),
    })
  }

  function onColResizeStart(colIndex: number, clientX: number) {
    resizeRef.current = {
      kind: 'col',
      colIndex,
      startPos: clientX,
      startLayout: structuredClone(normalized),
    }
  }

  function onRowResizeStart(colIndex: number, rowIndex: number, clientY: number) {
    resizeRef.current = {
      kind: 'row',
      colIndex,
      rowIndex,
      startPos: clientY,
      startLayout: structuredClone(normalized),
    }
  }

  function onResizeMove(e: PointerEvent) {
    const drag = resizeRef.current
    if (!drag) return
    const cols = structuredClone(drag.startLayout.columns)

    if (drag.kind === 'col') {
      const dx = e.clientX - drag.startPos
      const workspace = (e.currentTarget as HTMLElement).closest(
        '.flex-workspace',
      ) as HTMLElement | null
      const width = workspace?.clientWidth || 1
      const deltaPct = (dx / width) * 100
      const left = cols[drag.colIndex]
      const right = cols[drag.colIndex + 1]
      if (!left || !right) return
      const nextLeft = Math.max(14, Math.min(70, left.widthPercent + deltaPct))
      const diff = nextLeft - left.widthPercent
      const nextRight = right.widthPercent - diff
      if (nextRight < 14) return
      left.widthPercent = nextLeft
      right.widthPercent = nextRight
      commit({ columns: cols })
      return
    }

    if (drag.kind === 'row' && drag.rowIndex != null) {
      const dy = e.clientY - drag.startPos
      const colEl = document.querySelector(
        `[data-col-index="${drag.colIndex}"]`,
      ) as HTMLElement | null
      const height = colEl?.clientHeight || 1
      const deltaPct = (dy / height) * 100
      const col = cols[drag.colIndex]
      const a = col.panels[drag.rowIndex]
      const b = col.panels[drag.rowIndex + 1]
      if (!a || !b) return
      const nextA = Math.max(14, Math.min(86, a.heightPercent + deltaPct))
      const diff = nextA - a.heightPercent
      const nextB = b.heightPercent - diff
      if (nextB < 14) return
      a.heightPercent = nextA
      b.heightPercent = nextB
      commit({ columns: cols })
    }
  }

  function onResizeEnd() {
    resizeRef.current = null
  }

  return (
    <div
      className="flex-workspace"
      onPointerMove={onResizeMove}
      onPointerUp={onResizeEnd}
      onPointerLeave={onResizeEnd}
    >
      {normalized.columns.map((col, colIndex) => (
        <div key={col.id} className="flex-col-wrap" style={{ flex: `${col.widthPercent} 1 0%` }}>
          <div className="flex-column" data-col-index={colIndex}>
            {col.panels.map((slot, rowIndex) => (
              <div
                key={slot.id}
                className={`dock-panel ${dropHint?.col === colIndex && dropHint?.row === rowIndex ? 'drop-hover' : ''}`}
                style={{ flex: `${slot.heightPercent} 1 0%` }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropHint({ col: colIndex, row: rowIndex })
                }}
                onDragLeave={() => setDropHint(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropHint(null)
                  const payload = dragRef.current
                  if (!payload || payload.type !== 'panel') return
                  if (
                    payload.fromCol === colIndex &&
                    payload.fromRow === rowIndex
                  ) {
                    return
                  }
                  movePanel(payload.panelId, colIndex, rowIndex)
                  dragRef.current = null
                }}
              >
                <div
                  className="dock-panel-header"
                  draggable
                  onDragStart={() => {
                    dragRef.current = {
                      type: 'panel',
                      panelId: slot.id,
                      fromCol: colIndex,
                      fromRow: rowIndex,
                    }
                  }}
                  onDragEnd={() => {
                    dragRef.current = null
                    setDropHint(null)
                  }}
                >
                  <span className="dock-grip" aria-hidden>
                    ⠿
                  </span>
                  <span>{PANEL_LABELS[slot.id]}</span>
                </div>
                <div className="dock-panel-body">{renderPanel(slot.id)}</div>
                {rowIndex < col.panels.length - 1 && (
                  <div
                    className="dock-row-resizer"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).setPointerCapture(
                        e.pointerId,
                      )
                      onRowResizeStart(colIndex, rowIndex, e.clientY)
                    }}
                  />
                )}
              </div>
            ))}

            {/* Drop zone at end of column */}
            <div
              className="dock-col-tail"
              onDragOver={(e) => {
                e.preventDefault()
                setDropHint({ col: colIndex, row: col.panels.length })
              }}
              onDrop={(e) => {
                e.preventDefault()
                setDropHint(null)
                const payload = dragRef.current
                if (!payload || payload.type !== 'panel') return
                movePanel(payload.panelId, colIndex, col.panels.length)
                dragRef.current = null
              }}
            />
          </div>

          {colIndex < normalized.columns.length - 1 && (
            <div
              className="dock-col-resizer"
              onPointerDown={(e) => {
                e.preventDefault()
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                onColResizeStart(colIndex, e.clientX)
              }}
            />
          )}
        </div>
      ))}

      {/* New column drop zone */}
      <div
        className="dock-new-col"
        onDragOver={(e) => {
          e.preventDefault()
          setDropHint({ col: normalized.columns.length, row: 0 })
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDropHint(null)
          const payload = dragRef.current
          if (!payload || payload.type !== 'panel') return
          movePanel(payload.panelId, normalized.columns.length, 0)
          dragRef.current = null
        }}
        title="Hier ablegen = neue Spalte"
      />
    </div>
  )
}

export function resetUiLayout(): UiLayout {
  return defaultUiLayout()
}
