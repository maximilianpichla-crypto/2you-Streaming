import { useEffect, useRef, useState } from 'react'
import type { UpdateCheckResult } from '../shared/updates'
import type { AutoUpdateStatus } from '../../electron/autoUpdate'

const HOUR_MS = 60 * 60 * 1000

type Props = {
  checkRequest?: number
  onManualChecked?: (result: UpdateCheckResult | null) => void
}

export function UpdateBanner({ checkRequest = 0, onManualChecked }: Props) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [auto, setAuto] = useState<AutoUpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const lastRequest = useRef(checkRequest)

  async function load(manual: boolean) {
    setChecking(true)
    try {
      const next = await window.twoYou.checkUpdates()
      setResult(next)
      if (manual) {
        onManualChecked?.(next)
        void window.twoYou.checkAutoUpdate()
      }
    } catch {
      setResult(null)
      if (manual) onManualChecked?.(null)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void load(false)
    void window.twoYou.getAutoUpdateStatus().then(setAuto).catch(() => {})
    const unsub = window.twoYou.onAutoUpdateStatus(setAuto)
    const timer = window.setInterval(() => {
      void load(false)
      void window.twoYou.checkAutoUpdate()
    }, HOUR_MS)
    return () => {
      unsub()
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (checkRequest === lastRequest.current) return
    lastRequest.current = checkRequest
    if (checkRequest === 0) return
    void load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkRequest])

  const autoBusy =
    auto?.state === 'checking' ||
    auto?.state === 'available' ||
    auto?.state === 'downloading' ||
    auto?.state === 'downloaded'

  const item = result?.announcements[0]
  const showBanner =
    Boolean(item) ||
    Boolean(result?.hasVersionUpdate) ||
    autoBusy ||
    auto?.state === 'error'

  if (!showBanner) return null

  const title =
    auto?.state === 'downloading'
      ? 'Update wird geladen'
      : auto?.state === 'downloaded'
        ? 'Update wird installiert'
        : auto?.state === 'available' || auto?.state === 'checking'
          ? 'Update'
          : (item?.title ?? result?.feed.title ?? 'Update')

  const body =
    auto?.message ||
    item?.body ||
    result?.feed.body ||
    (result?.hasVersionUpdate
      ? 'Update wird im Hintergrund geladen und still installiert — ohne Installer-Fenster.'
      : '')

  const level = item?.level ?? result?.feed.level ?? 'update'

  async function dismiss() {
    const ids = result?.announcements.map((a) => a.id) ?? []
    if (ids.length) await window.twoYou.dismissUpdates(ids)
    setResult((prev) =>
      prev
        ? {
            ...prev,
            announcements: [],
            hasVersionUpdate: false,
          }
        : null,
    )
  }

  return (
    <div
      className={`update-banner level-${level}${checking || auto?.state === 'checking' ? ' checking' : ''}`}
      role="status"
    >
      <div className="update-banner-text">
        <strong>{title}</strong>
        {body ? <span>{body}</span> : null}
        {result?.hasVersionUpdate ? (
          <span className="update-banner-meta">
            v{result.appVersion} → v{result.feed.version}
          </span>
        ) : null}
        {auto?.state === 'downloading' && typeof auto.percent === 'number' ? (
          <span className="update-banner-meta">
            {Math.round(auto.percent)}%
          </span>
        ) : null}
      </div>
      <div className="update-banner-actions">
        {auto?.state === 'downloaded' ? (
          <button
            type="button"
            className="primary"
            onClick={() => void window.twoYou.installUpdateNow()}
          >
            Jetzt installieren
          </button>
        ) : null}
        {auto?.state === 'downloading' ? (
          <span className="update-banner-meta">Läuft automatisch…</span>
        ) : null}
        {result?.hasVersionUpdate && auto?.state !== 'downloaded' ? (
          <span className="update-banner-meta">
            Kein Installer-Assistent — Einstellungen bleiben erhalten.
          </span>
        ) : null}
        {!result?.forceUpdate && auto?.state !== 'downloading' ? (
          <button type="button" className="ghost" onClick={() => void dismiss()}>
            OK
          </button>
        ) : null}
      </div>
    </div>
  )
}
