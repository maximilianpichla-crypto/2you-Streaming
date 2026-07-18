import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  compareSemver,
  isValidFeed,
  DEFAULT_UPDATE_FEED_URL,
  type UpdateAnnouncement,
  type UpdateCheckResult,
  type UpdateFeed,
} from '../src/shared/updates'
import { loadConfig } from './config'

const DISMISSED_FILE = 'dismissed-updates.json'

function dismissedPath(): string {
  return path.join(app.getPath('userData'), DISMISSED_FILE)
}

function readDismissed(): string[] {
  try {
    const raw = fs.readFileSync(dismissedPath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function dismissUpdateIds(ids: string[]): void {
  const set = new Set([...readDismissed(), ...ids])
  fs.mkdirSync(path.dirname(dismissedPath()), { recursive: true })
  fs.writeFileSync(dismissedPath(), JSON.stringify([...set], null, 2), 'utf8')
}

function localFeedPath(): string {
  // Dev: Projekt/updates/feed.json · Packaged: resources/updates/feed.json
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'updates', 'feed.json')
  }
  return path.join(process.resourcesPath, 'updates', 'feed.json')
}

function readLocalFeed(): UpdateFeed | null {
  try {
    const file = localFeedPath()
    if (!fs.existsSync(file)) return null
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    return isValidFeed(data) ? data : null
  } catch {
    return null
  }
}

async function fetchRemoteFeed(url: string): Promise<UpdateFeed | null> {
  try {
    const bust = url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`
    const res = await fetch(url + bust, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    return isValidFeed(data) ? data : null
  } catch {
    return null
  }
}

function resolveFeedUrl(): string {
  const fromEnv = process.env.TWOYOU_UPDATE_URL?.trim()
  if (fromEnv) return fromEnv
  const fromSettings = loadConfig().settings.updateFeedUrl?.trim()
  if (fromSettings) return fromSettings
  return DEFAULT_UPDATE_FEED_URL
}

function buildResult(
  feed: UpdateFeed,
  source: 'remote' | 'local',
): UpdateCheckResult {
  const appVersion = app.getVersion()
  const dismissed = new Set(readDismissed())
  const hasVersionUpdate = compareSemver(feed.version, appVersion) > 0
  const forceUpdate = Boolean(
    feed.minVersion && compareSemver(appVersion, feed.minVersion) < 0,
  )

  const fromList = (feed.announcements ?? []).filter((a) => a?.id && !dismissed.has(a.id))
  const mainId = `feed-${feed.version}-${feed.publishedAt}`
  const announcements: UpdateAnnouncement[] = [...fromList]

  const shouldShowMain =
    !dismissed.has(mainId) &&
    Boolean(feed.title?.trim()) &&
    Boolean(feed.body?.trim()) &&
    (hasVersionUpdate ||
      forceUpdate ||
      feed.level === 'important' ||
      feed.level === 'update' ||
      // Frische Info-Nachricht ohne Listen-Einträge
      (feed.level === 'info' && fromList.length === 0 && feed.body !== 'Updates und Hinweise erscheinen hier automatisch.'))

  if (shouldShowMain) {
    announcements.unshift({
      id: mainId,
      title: feed.title,
      body: feed.body,
      level: feed.level ?? (hasVersionUpdate ? 'update' : 'info'),
      createdAt: feed.publishedAt,
    })
  }

  return {
    feed,
    appVersion,
    hasVersionUpdate,
    forceUpdate,
    announcements,
    source,
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  const remoteUrl = resolveFeedUrl()
  if (remoteUrl) {
    const remote = await fetchRemoteFeed(remoteUrl)
    if (remote) return buildResult(remote, 'remote')
  }

  const local = readLocalFeed()
  if (local) return buildResult(local, 'local')
  return null
}

import { checkAutoUpdate, getAutoUpdateStatus, installAutoUpdateNow } from './autoUpdate'

export async function openUpdateDownload(_url?: string): Promise<boolean> {
  const status = getAutoUpdateStatus()
  if (status.state === 'downloaded') {
    return installAutoUpdateNow()
  }
  if (
    status.state === 'idle' ||
    status.state === 'not-available' ||
    status.state === 'error'
  ) {
    await checkAutoUpdate()
  }
  const again = getAutoUpdateStatus()
  if (again.state === 'downloaded') {
    return installAutoUpdateNow()
  }
  return (
    again.state === 'downloading' ||
    again.state === 'available' ||
    again.state === 'checking'
  )
}
