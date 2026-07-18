import type { TransitionId, TransitionSettings } from '../shared/types'
import { TRANSITION_PRESETS } from '../shared/types'

interface Props {
  transition: TransitionSettings
  onChange: (transition: TransitionSettings) => void
  disabled?: boolean
}

export function TransitionPanel({ transition, onChange, disabled }: Props) {
  return (
    <div className="transition-block">
      <div className="section-title" style={{ marginTop: 0 }}>
        Übergang
      </div>
      <div className="field">
        <label htmlFor="transition-type">Animation</label>
        <select
          id="transition-type"
          value={transition.type}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...transition,
              type: e.target.value as TransitionId,
            })
          }
        >
          {TRANSITION_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="transition-ms">
          Dauer: {transition.durationMs} ms
        </label>
        <input
          id="transition-ms"
          type="range"
          min={100}
          max={3000}
          step={50}
          value={transition.durationMs}
          disabled={disabled || transition.type === 'cut'}
          onChange={(e) =>
            onChange({
              ...transition,
              durationMs: Number(e.target.value) || 500,
            })
          }
        />
      </div>
      <p className="transition-hint">
        {TRANSITION_PRESETS.find((p) => p.id === transition.type)?.description}
      </p>
    </div>
  )
}
