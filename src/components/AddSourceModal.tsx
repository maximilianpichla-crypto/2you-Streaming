import { useMemo, useState } from 'react'
import { OBS_SOURCE_TYPES, type SourceType } from '../shared/types'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (type: SourceType) => void
  /** visual = Szene (ohne Audio), audio = nur Audio-Typen */
  mode?: 'all' | 'visual' | 'audio'
}

const CATEGORIES: { id: 'video' | 'audio' | 'media' | 'other'; label: string }[] = [
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'media', label: 'Medien' },
  { id: 'other', label: 'Sonstiges' },
]

export function AddSourceModal({
  open,
  onClose,
  onPick,
  mode = 'all',
}: Props) {
  const [filter, setFilter] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id'] | 'all'>('all')

  const allowedCategories = CATEGORIES.filter((c) => {
    if (mode === 'visual') return c.id !== 'audio'
    if (mode === 'audio') return c.id === 'audio'
    return true
  })

  const items = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return OBS_SOURCE_TYPES.filter((s) => {
      if (mode === 'visual' && s.category === 'audio') return false
      if (mode === 'audio' && s.category !== 'audio') return false
      if (category !== 'all' && s.category !== category) return false
      if (!q) return true
      return (
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      )
    })
  }, [filter, category, mode])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Quelle hinzufügen"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>
            {mode === 'audio'
              ? 'Audio-Quelle hinzufügen'
              : mode === 'visual'
                ? 'Video-Quelle hinzufügen'
                : 'Quelle hinzufügen'}
          </h2>
          <button type="button" className="ghost" onClick={onClose}>
            Schließen
          </button>
        </div>

        <div className="modal-toolbar">
          <input
            placeholder="Quellen suchen…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
          <div className="chip-row">
            <button
              type="button"
              className={category === 'all' ? 'primary' : 'ghost'}
              onClick={() => setCategory('all')}
            >
              Alle
            </button>
            {allowedCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={category === c.id ? 'primary' : 'ghost'}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-list">
          {items.map((item) => (
            <button
              key={item.type}
              type="button"
              className="source-pick"
              onClick={() => {
                onPick(item.type)
                onClose()
              }}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
          {items.length === 0 && (
            <div className="empty-hint">Keine Quelle gefunden</div>
          )}
        </div>
      </div>
    </div>
  )
}
