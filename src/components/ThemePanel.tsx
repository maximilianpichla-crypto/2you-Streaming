import { THEME_COLOR_FIELDS, THEME_PRESETS, defaultTheme, type ThemeColors } from '../shared/types'

interface Props {
  open: boolean
  theme: ThemeColors
  onClose: () => void
  onChange: (theme: ThemeColors) => void
}

const GROUPS: { id: 'flächen' | 'text' | 'akzente'; label: string }[] = [
  { id: 'flächen', label: 'Flächen' },
  { id: 'text', label: 'Text' },
  { id: 'akzente', label: 'Akzente' },
]

export function ThemePanel({ open, theme, onClose, onChange }: Props) {
  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal theme-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Farben anpassen"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Farben anpassen</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Schließen
          </button>
        </div>

        <div className="modal-toolbar">
          <div className="chip-row">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="ghost"
                onClick={() => onChange({ ...preset.colors })}
                title={preset.label}
              >
                <span
                  className="theme-swatch"
                  style={{
                    background: `linear-gradient(135deg, ${preset.colors.bg}, ${preset.colors.accent})`,
                  }}
                />
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-list theme-grid">
          {GROUPS.map((group) => (
            <div key={group.id} className="theme-group">
              <div className="section-title">{group.label}</div>
              {THEME_COLOR_FIELDS.filter((f) => f.group === group.id).map((field) => (
                <label key={field.key} className="theme-color-row">
                  <span>{field.label}</span>
                  <span className="theme-color-controls">
                    <input
                      type="color"
                      value={normalizeHex(theme[field.key])}
                      onChange={(e) =>
                        onChange({ ...theme, [field.key]: e.target.value })
                      }
                    />
                    <input
                      type="text"
                      value={theme[field.key]}
                      spellCheck={false}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        if (/^#[0-9a-fA-F]{3,8}$/.test(v) || v === '') {
                          onChange({ ...theme, [field.key]: v || theme[field.key] })
                        } else {
                          onChange({ ...theme, [field.key]: v })
                        }
                      }}
                    />
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="theme-footer">
          <button type="button" className="ghost" onClick={() => onChange(defaultTheme())}>
            Zurücksetzen
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Fertig
          </button>
        </div>
      </div>
    </div>
  )
}

function normalizeHex(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value[1]
    const g = value[2]
    const b = value[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#000000'
}
