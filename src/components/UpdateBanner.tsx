import { useEffect, useRef, useState } from 'react'
import type { UpdateCheckResult } from '../shared/updates'

const HOUR_MS = 60 * 60 * 1000

type Props = {
  /** Erhöhen = sofort erneut prüfen (z. B. Button) */
  checkRequest?: number
  /** Nur bei manuellem Check (checkRequest-Änderung) */
  onManualChecked?: (result: UpdateCheckResult | null) => void
}

export function UpdateBanner({ checkRequest = 0, onManualChecked }: Props) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const lastRequest = useRef(checkRequest)

  async function load(manual: boolean) {
    setChecking(true)
    try {
      const next = await window.twoYou.checkUpdates()
      setResult(next)
      if (manual) onManualChecked?.(next)
    } catch {
      setResult(null)
      if (manual) onManualChecked?.(null)
    } finally {
      setChecking(false)
    }
  }

  // Start + stündlich
  useEffect(() => {
    void load(false)
    const timer = window.setInterval(() => void load(false), HOUR_MS)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Manueller Button
  useEffect(() => {
    if (checkRequest === lastRequest.current) return
    lastRequest.current = checkRequest
    if (checkRequest === 0) return
    void load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkRequest])

  const item = result?.announcements[0]
  if (!item && !result?.hasVersionUpdate) return null

  const title = item?.title ?? result?.feed.title ?? 'Update'
  const body = item?.body ?? result?.feed.body ?? ''
  const level = item?.level ?? result?.feed.level ?? 'info'
  const showDownload = Boolean(
    result?.hasVersionUpdate && result.feed.downloadUrl,
  )

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
      className={`update-banner level-${level}${checking ? ' checking' : ''}`}
      role="status"
    >
      <div className="update-banner-text">
        <strong>{title}</strong>
        {body ? <span>{body}</span> : null}
        {result?.hasVersionUpdate ? (
          <span className="update-banner-meta">
            v{result.appVersion} → v{result.feed.version}
            {result.source === 'local' ? ' · lokal' : ''}
          </span>
        ) : null}
      </div>
      <div className="update-banner-actions">
        {showDownload ? (
          <button
            type="button"
            className="primary"
            onClick={() => void window.twoYou.openUpdateDownload()}
          >
            Download
          </button>
        ) : null}
        {result?.hasVersionUpdate ? (
          <span className="update-banner-meta">
            Deine Szenen &amp; Einstellungen bleiben erhalten.
          </span>
        ) : null}
        {!result?.forceUpdate ? (
          <button type="button" className="ghost" onClick={() => void dismiss()}>
            OK
          </button>
        ) : null}
      </div>
    </div>
  )
}
