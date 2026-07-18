/**
 * Update- / Nachrichten-Feed für 2you Streaming.
 * Nutzer-Apps laden diesen Feed (lokal im Dev, remote in Produktion).
 */

/** Standard-Update-Feed (öffentliches GitHub-Repo) */
export const DEFAULT_UPDATE_FEED_URL =
  'https://raw.githubusercontent.com/maximilianpichla-crypto/2you-Streaming/main/updates/feed.json'

export const UPDATE_REPO_URL =
  'https://github.com/maximilianpichla-crypto/2you-Streaming.git'

export type UpdateLevel = 'info' | 'update' | 'important'

export interface UpdateAnnouncement {
  id: string
  title: string
  body: string
  level?: UpdateLevel
  /** ISO date */
  createdAt?: string
}

export interface UpdateFeed {
  /** Semver der aktuell empfohlenen App-Version */
  version: string
  publishedAt: string
  /** Optional: ältere Clients sollen zwingend updaten */
  minVersion?: string | null
  downloadUrl?: string
  title: string
  body: string
  level?: UpdateLevel
  announcements?: UpdateAnnouncement[]
}

export interface UpdateCheckResult {
  feed: UpdateFeed
  appVersion: string
  /** Neuere Version im Feed als installiert */
  hasVersionUpdate: boolean
  /** Zwangsupdate laut minVersion */
  forceUpdate: boolean
  /** Noch nicht gesehene Ankündigungen */
  announcements: UpdateAnnouncement[]
  source: 'remote' | 'local'
}

/** Semver-Vergleich: 1 wenn a>b, -1 wenn a<b, 0 gleich */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

export function isValidFeed(data: unknown): data is UpdateFeed {
  if (!data || typeof data !== 'object') return false
  const f = data as Record<string, unknown>
  return typeof f.version === 'string' && typeof f.title === 'string'
}
