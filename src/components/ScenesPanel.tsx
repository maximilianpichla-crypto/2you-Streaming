import type { Scene } from '../shared/types'

interface Props {
  scenes: Scene[]
  activeSceneId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  embedded?: boolean
}

export function ScenesPanel({
  scenes,
  activeSceneId,
  onSelect,
  onAdd,
  onRename,
  onRemove,
  embedded = false,
}: Props) {
  return (
    <div className={`panel ${embedded ? 'embedded' : ''}`}>
      {!embedded && <div className="panel-header">Szenen</div>}
      <div className="panel-body">
        <div className="list">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={`list-item ${scene.id === activeSceneId ? 'active' : ''}`}
              onClick={() => onSelect(scene.id)}
              onDoubleClick={() => {
                const name = window.prompt('Szenenname', scene.name)
                if (name?.trim()) onRename(scene.id, name.trim())
              }}
            >
              {scene.name}
              <span className="meta">{scene.sources.length}</span>
            </button>
          ))}
        </div>
        <div className="source-actions">
          <button type="button" onClick={onAdd}>
            + Szene
          </button>
          <button
            type="button"
            className="ghost"
            disabled={scenes.length <= 1}
            onClick={() => onRemove(activeSceneId)}
          >
            Entfernen
          </button>
        </div>
      </div>
    </div>
  )
}
