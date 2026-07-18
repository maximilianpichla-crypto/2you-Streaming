import { useEffect, useState } from 'react'
import type { UpdateCheckResult } from '../shared/updates'

type Props = {
  refreshKey?: number
}

export function UpdateBanner({ refreshKey = 0 }: Props) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const next = await window.twoYou.checkUpdates()
        if (!cancelled) setResult(next)
      } catch {
        if (!cancelled) setResult(null)
      }
    }

    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [refreshKey])

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
    <div className={`update-banner level-${level}`} role="status">
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
        {!result?.forceUpdate ? (
          <button type="button" className="ghost" onClick={() => void dismiss()}>
            OK
          </button>
        ) : null}
      </div>
    </div>
  )
}
