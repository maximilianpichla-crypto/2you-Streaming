import { useState } from 'react'
import type {
  AlertMediaLayout,
  AlertTextLayout,
  AlertTypeConfig,
  AlertTypeId,
  AlertsSettings,
} from '../shared/types'
import {
  ALERT_TYPE_ORDER,
  normalizeAlertType,
  renderAlertTemplate,
  defaultAlerts,
} from '../shared/types'
import { emitAlert } from '../alertBus'
import { AlertBox } from './AlertBox'

interface Props {
  alerts: AlertsSettings
  onChange: (alerts: AlertsSettings) => void
  onApplyAndTest: (alerts: AlertsSettings, type: AlertTypeId) => void
}

type EditTab = 'general' | 'frame' | 'media' | 'title' | 'subtitle'

function PercentSlider({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 100,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="obs-row">
      <label htmlFor={id}>{label}</label>
      <div className="obs-inline">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="alert-pct">{value}%</span>
      </div>
    </div>
  )
}

function basename(path: string): string {
  if (!path) return 'Keine Datei'
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

export function AlertEditor({ alerts, onChange, onApplyAndTest }: Props) {
  const [typeId, setTypeId] = useState<AlertTypeId>('follow')
  const [tab, setTab] = useState<EditTab>('general')

  const defaults = defaultAlerts()
  const current = normalizeAlertType(alerts.types[typeId] ?? {}, defaults.types[typeId])

  const patchType = (next: AlertTypeConfig) => {
    onChange({
      ...alerts,
      types: { ...alerts.types, [typeId]: next },
    })
  }

  const patchMedia = (partial: Partial<AlertMediaLayout>) => {
    patchType({ ...current, media: { ...current.media, ...partial } })
  }

  const patchTitle = (partial: Partial<AlertTextLayout>) => {
    patchType({
      ...current,
      titleLayout: { ...current.titleLayout, ...partial },
    })
  }

  const patchSubtitle = (partial: Partial<AlertTextLayout>) => {
    patchType({
      ...current,
      subtitleLayout: { ...current.subtitleLayout, ...partial },
    })
  }

  const pickMedia = async (kind: 'image' | 'video') => {
    const dialogKind = kind === 'image' ? 'image' : 'video'
    const paths = await window.twoYou.openFileDialog(dialogKind)
    if (!paths?.[0]) return
    patchMedia({ kind, filePath: paths[0] })
  }

  const samplePayload = {
    type: typeId,
    name: 'MaxMustermann',
    amount: '10€',
    months: '3',
    viewers: '42',
    message: 'Lokaler Test-Alert',
  }
  const previewTitle = renderAlertTemplate(current.titleTemplate, samplePayload)
  const previewSubtitle = renderAlertTemplate(current.subtitleTemplate, samplePayload)

  return (
    <div className="alert-editor">
      <p className="obs-hint" style={{ paddingLeft: 0, marginTop: 0 }}>
        Lokale Alerts – Bild/Video und Textposition frei setzen. Erscheinen als Overlay
        in der Vorschau.
      </p>

      <div className="obs-row">
        <label htmlFor="obs-alerts-on">Alerts aktiv</label>
        <input
          id="obs-alerts-on"
          type="checkbox"
          checked={alerts.enabled}
          onChange={(e) => onChange({ ...alerts, enabled: e.target.checked })}
        />
      </div>

      <div className="obs-row">
        <label htmlFor="obs-alert-vol">Sound-Lautstärke</label>
        <div className="obs-inline">
          <input
            id="obs-alert-vol"
            type="range"
            min={0}
            max={100}
            value={alerts.volume}
            onChange={(e) =>
              onChange({ ...alerts, volume: Number(e.target.value) })
            }
          />
          <span>{alerts.volume}%</span>
        </div>
      </div>

      <div className="alert-type-tabs">
        {ALERT_TYPE_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={typeId === id ? 'active' : ''}
            onClick={() => setTypeId(id)}
          >
            {alerts.types[id]?.label ?? defaults.types[id].label}
          </button>
        ))}
      </div>

      <div className="alert-preview-stage">
        <div className="alert-preview-label">Live-Vorschau</div>
        <div className="alert-preview-canvas">
          <AlertBox
            config={current}
            title={previewTitle}
            subtitle={previewSubtitle}
            previewMode
          />
        </div>
      </div>

      <div className="alert-edit-tabs">
        {(
          [
            ['general', 'Text'],
            ['frame', 'Rahmen'],
            ['media', 'Bild / Video'],
            ['title', 'Titel-Pos.'],
            ['subtitle', 'Untertitel'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="obs-form alert-editor-form">
        {tab === 'general' && (
          <>
            <div className="obs-row">
              <label htmlFor="obs-alert-en">Dieser Typ aktiv</label>
              <input
                id="obs-alert-en"
                type="checkbox"
                checked={current.enabled}
                onChange={(e) =>
                  patchType({ ...current, enabled: e.target.checked })
                }
              />
            </div>
            <div className="obs-row">
              <label htmlFor="obs-alert-title">Titel-Vorlage</label>
              <input
                id="obs-alert-title"
                value={current.titleTemplate}
                onChange={(e) =>
                  patchType({ ...current, titleTemplate: e.target.value })
                }
              />
            </div>
            <div className="obs-row">
              <label htmlFor="obs-alert-sub">Untertitel-Vorlage</label>
              <input
                id="obs-alert-sub"
                value={current.subtitleTemplate}
                onChange={(e) =>
                  patchType({ ...current, subtitleTemplate: e.target.value })
                }
              />
            </div>
            <p className="obs-hint">
              Platzhalter: {'{name}'} {'{amount}'} {'{months}'} {'{viewers}'}{' '}
              {'{message}'}
            </p>
            <div className="obs-row">
              <label htmlFor="obs-alert-dur">Anzeigedauer</label>
              <div className="obs-inline">
                <input
                  id="obs-alert-dur"
                  type="number"
                  min={1000}
                  max={20000}
                  step={100}
                  value={current.durationMs}
                  onChange={(e) =>
                    patchType({
                      ...current,
                      durationMs: Number(e.target.value) || 4000,
                    })
                  }
                />
                <span>ms</span>
              </div>
            </div>
            <div className="obs-row">
              <label htmlFor="obs-alert-anim">Animation</label>
              <select
                id="obs-alert-anim"
                value={current.animation}
                onChange={(e) =>
                  patchType({
                    ...current,
                    animation: e.target.value as AlertTypeConfig['animation'],
                  })
                }
              >
                <option value="slide">Einschieben</option>
                <option value="fade">Einblenden</option>
                <option value="bounce">Bounce</option>
              </select>
            </div>
            <div className="obs-row">
              <label htmlFor="obs-alert-sound">Lokaler Sound</label>
              <input
                id="obs-alert-sound"
                type="checkbox"
                checked={current.soundEnabled}
                onChange={(e) =>
                  patchType({ ...current, soundEnabled: e.target.checked })
                }
              />
            </div>
            <div className="obs-row">
              <label>Akzentfarbe</label>
              <input
                type="color"
                value={current.accentColor.slice(0, 7)}
                onChange={(e) =>
                  patchType({ ...current, accentColor: e.target.value })
                }
              />
            </div>
          </>
        )}

        {tab === 'frame' && (
          <>
            <div className="obs-row">
              <label htmlFor="obs-alert-bg-on">Hintergrund</label>
              <input
                id="obs-alert-bg-on"
                type="checkbox"
                checked={current.showBackground}
                onChange={(e) =>
                  patchType({ ...current, showBackground: e.target.checked })
                }
              />
            </div>
            <div className="obs-row">
              <label>Hintergrundfarbe</label>
              <input
                type="color"
                value={current.bgColor.slice(0, 7)}
                onChange={(e) =>
                  patchType({ ...current, bgColor: `${e.target.value}ee` })
                }
              />
            </div>
            <PercentSlider
              id="box-x"
              label="Horizontal"
              value={current.boxXPercent}
              onChange={(v) => patchType({ ...current, boxXPercent: v })}
            />
            <PercentSlider
              id="box-y"
              label="Vertikal"
              value={current.boxYPercent}
              onChange={(v) => patchType({ ...current, boxYPercent: v })}
            />
            <PercentSlider
              id="box-w"
              label="Breite"
              value={current.boxWidthPercent}
              min={10}
              max={100}
              onChange={(v) => patchType({ ...current, boxWidthPercent: v })}
            />
            <PercentSlider
              id="box-h"
              label="Höhe"
              value={current.boxHeightPercent}
              min={10}
              max={100}
              onChange={(v) => patchType({ ...current, boxHeightPercent: v })}
            />
          </>
        )}

        {tab === 'media' && (
          <>
            <div className="obs-row">
              <label htmlFor="obs-alert-media-kind">Medientyp</label>
              <select
                id="obs-alert-media-kind"
                value={current.media.kind}
                onChange={(e) => {
                  const kind = e.target.value as AlertMediaLayout['kind']
                  patchMedia({
                    kind,
                    filePath: kind === 'none' ? '' : current.media.filePath,
                  })
                }}
              >
                <option value="none">Kein Medium</option>
                <option value="image">Bild</option>
                <option value="video">Video</option>
              </select>
            </div>

            {current.media.kind !== 'none' && (
              <>
                <div className="obs-row">
                  <label>Datei</label>
                  <div className="obs-inline alert-file-row">
                    <span className="alert-file-name" title={current.media.filePath}>
                      {basename(current.media.filePath)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void pickMedia(current.media.kind as 'image' | 'video')}
                    >
                      Auswählen…
                    </button>
                    {current.media.filePath && (
                      <button
                        type="button"
                        onClick={() => patchMedia({ filePath: '' })}
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
                <PercentSlider
                  id="media-x"
                  label="Horizontal"
                  value={current.media.xPercent}
                  onChange={(v) => patchMedia({ xPercent: v })}
                />
                <PercentSlider
                  id="media-y"
                  label="Vertikal"
                  value={current.media.yPercent}
                  onChange={(v) => patchMedia({ yPercent: v })}
                />
                <PercentSlider
                  id="media-w"
                  label="Breite"
                  value={current.media.widthPercent}
                  min={5}
                  max={100}
                  onChange={(v) => patchMedia({ widthPercent: v })}
                />
                <PercentSlider
                  id="media-h"
                  label="Höhe"
                  value={current.media.heightPercent}
                  min={5}
                  max={100}
                  onChange={(v) => patchMedia({ heightPercent: v })}
                />
                <div className="obs-row">
                  <label htmlFor="obs-alert-fit">Einpassung</label>
                  <select
                    id="obs-alert-fit"
                    value={current.media.fit}
                    onChange={(e) =>
                      patchMedia({
                        fit: e.target.value as AlertMediaLayout['fit'],
                      })
                    }
                  >
                    <option value="contain">Contain</option>
                    <option value="cover">Cover</option>
                  </select>
                </div>
                {current.media.kind === 'video' && (
                  <>
                    <div className="obs-row">
                      <label htmlFor="obs-alert-loop">Loop</label>
                      <input
                        id="obs-alert-loop"
                        type="checkbox"
                        checked={current.media.loop}
                        onChange={(e) => patchMedia({ loop: e.target.checked })}
                      />
                    </div>
                    <div className="obs-row">
                      <label htmlFor="obs-alert-muted">Stumm</label>
                      <input
                        id="obs-alert-muted"
                        type="checkbox"
                        checked={current.media.muted}
                        onChange={(e) => patchMedia({ muted: e.target.checked })}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {tab === 'title' && (
          <TextLayoutForm
            prefix="title"
            layout={current.titleLayout}
            onChange={patchTitle}
          />
        )}

        {tab === 'subtitle' && (
          <TextLayoutForm
            prefix="sub"
            layout={current.subtitleLayout}
            onChange={patchSubtitle}
          />
        )}

        <div className="obs-row">
          <label>Test</label>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onApplyAndTest(alerts, typeId)
              window.setTimeout(() => {
                emitAlert(samplePayload)
              }, 80)
            }}
          >
            Alert testen
          </button>
        </div>
      </div>
    </div>
  )
}

function TextLayoutForm({
  prefix,
  layout,
  onChange,
}: {
  prefix: string
  layout: AlertTextLayout
  onChange: (partial: Partial<AlertTextLayout>) => void
}) {
  return (
    <>
      <div className="obs-row">
        <label htmlFor={`${prefix}-vis`}>Sichtbar</label>
        <input
          id={`${prefix}-vis`}
          type="checkbox"
          checked={layout.visible}
          onChange={(e) => onChange({ visible: e.target.checked })}
        />
      </div>
      <PercentSlider
        id={`${prefix}-x`}
        label="Horizontal"
        value={layout.xPercent}
        onChange={(v) => onChange({ xPercent: v })}
      />
      <PercentSlider
        id={`${prefix}-y`}
        label="Vertikal"
        value={layout.yPercent}
        onChange={(v) => onChange({ yPercent: v })}
      />
      <div className="obs-row">
        <label htmlFor={`${prefix}-size`}>Schriftgröße</label>
        <div className="obs-inline">
          <input
            id={`${prefix}-size`}
            type="range"
            min={10}
            max={72}
            value={layout.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          />
          <span>{layout.fontSize}px</span>
        </div>
      </div>
      <PercentSlider
        id={`${prefix}-mw`}
        label="Max. Breite"
        value={layout.maxWidthPercent}
        min={20}
        max={100}
        onChange={(v) => onChange({ maxWidthPercent: v })}
      />
      <div className="obs-row">
        <label htmlFor={`${prefix}-align`}>Ausrichtung</label>
        <select
          id={`${prefix}-align`}
          value={layout.align}
          onChange={(e) =>
            onChange({
              align: e.target.value as AlertTextLayout['align'],
            })
          }
        >
          <option value="left">Links</option>
          <option value="center">Mitte</option>
          <option value="right">Rechts</option>
        </select>
      </div>
      <div className="obs-row">
        <label>Farbe</label>
        <input
          type="color"
          value={layout.color.slice(0, 7)}
          onChange={(e) => onChange({ color: e.target.value })}
        />
      </div>
      <div className="obs-row">
        <label htmlFor={`${prefix}-bold`}>Fett</label>
        <input
          id={`${prefix}-bold`}
          type="checkbox"
          checked={layout.bold}
          onChange={(e) => onChange({ bold: e.target.checked })}
        />
      </div>
    </>
  )
}
