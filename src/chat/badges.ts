/** Twitch Chat-Badges (Mod, VIP, Broadcaster, …) */

export type BadgeSetMap = Map<string, string>

interface BadgeVersion {
  image_url_1x?: string
  image_url_2x?: string
  image_url_4x?: string
  title?: string
  description?: string
}

interface BadgeSetsResponse {
  badge_sets?: Record<
    string,
    {
      versions?: Record<string, BadgeVersion>
    }
  >
}

export interface ChatBadge {
  set: string
  version: string
  url: string
  title: string
}

function ingestBadgeSets(data: BadgeSetsResponse, into: BadgeSetMap): void {
  const sets = data.badge_sets ?? {}
  for (const [setId, set] of Object.entries(sets)) {
    const versions = set.versions ?? {}
    for (const [version, info] of Object.entries(versions)) {
      const url = info.image_url_2x || info.image_url_1x || info.image_url_4x
      if (!url) continue
      into.set(`${setId}/${version}`, url)
      // title cache key
      into.set(`title:${setId}/${version}`, info.title || setId)
    }
  }
}

export async function loadGlobalBadges(): Promise<BadgeSetMap> {
  const map: BadgeSetMap = new Map()
  try {
    const res = await fetch('https://badges.twitch.tv/v1/badges/global/display')
    if (!res.ok) return map
    ingestBadgeSets((await res.json()) as BadgeSetsResponse, map)
  } catch {
    // offline / blocked
  }
  return map
}

export async function loadChannelBadges(roomId: string): Promise<BadgeSetMap> {
  const map: BadgeSetMap = new Map()
  if (!roomId) return map
  try {
    const res = await fetch(
      `https://badges.twitch.tv/v1/badges/channels/${encodeURIComponent(roomId)}/display`,
    )
    if (!res.ok) return map
    ingestBadgeSets((await res.json()) as BadgeSetsResponse, map)
  } catch {
    // ignore
  }
  return map
}

/** Merge: channel overrides global for same set/version */
export function mergeBadgeMaps(
  globalMap: BadgeSetMap,
  channelMap: BadgeSetMap,
): BadgeSetMap {
  const merged = new Map(globalMap)
  for (const [k, v] of channelMap) merged.set(k, v)
  return merged
}

/**
 * badges-raw: "broadcaster/1,subscriber/12,moderator/1,vip/1"
 * Reihenfolge wie von Twitch (links → rechts).
 */
export function resolveBadges(
  badgesRaw: string | undefined,
  badges: Record<string, string> | undefined,
  badgeMap: BadgeSetMap,
): ChatBadge[] {
  const entries: { set: string; version: string }[] = []

  if (badgesRaw) {
    for (const part of badgesRaw.split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const slash = trimmed.indexOf('/')
      if (slash < 0) {
        entries.push({ set: trimmed, version: '1' })
      } else {
        entries.push({
          set: trimmed.slice(0, slash),
          version: trimmed.slice(slash + 1) || '1',
        })
      }
    }
  } else if (badges) {
    for (const [set, version] of Object.entries(badges)) {
      if (version == null) continue
      entries.push({ set, version: String(version) })
    }
  }

  const result: ChatBadge[] = []
  for (const { set, version } of entries) {
    const key = `${set}/${version}`
    let url = badgeMap.get(key)
    // Fallback: version 1 of same set
    if (!url && version !== '1') url = badgeMap.get(`${set}/1`)
    if (!url) continue
    result.push({
      set,
      version,
      url,
      title: badgeMap.get(`title:${key}`) || badgeMap.get(`title:${set}/1`) || set,
    })
  }
  return result
}
