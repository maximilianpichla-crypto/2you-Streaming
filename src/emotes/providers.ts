export type EmoteProvider = 'twitch' | '7tv' | 'ffz' | 'bttv'

export interface EmoteDef {
  code: string
  url: string
  provider: EmoteProvider
}

export type EmoteMap = Map<string, EmoteDef>

interface TwitchUserInfo {
  id: string
  login: string
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function resolveTwitchUser(login: string): Promise<TwitchUserInfo | null> {
  // IVR (kein Twitch-Client-ID nötig)
  const ivr = await fetchJson<Array<{ id: string; login: string }>>(
    `https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(login)}`,
  )
  if (ivr?.[0]?.id) {
    return { id: ivr[0].id, login: ivr[0].login || login }
  }

  // Fallback über FrankerFaceZ Room
  const ffz = await fetchJson<{
    room?: { twitch_id?: number; id?: string }
  }>(`https://api.frankerfacez.com/v1/room/${encodeURIComponent(login)}`)
  if (ffz?.room?.twitch_id) {
    return { id: String(ffz.room.twitch_id), login }
  }
  return null
}

function addEmote(map: EmoteMap, code: string, url: string, provider: EmoteProvider): void {
  if (!code || !url) return
  // Prefer first registration; don't overwrite with lower priority later if we load in priority order
  if (map.has(code)) return
  const absolute = url.startsWith('//') ? `https:${url}` : url
  map.set(code, { code, url: absolute, provider })
}

async function loadBttv(map: EmoteMap, twitchId: string): Promise<void> {
  type BttvEmote = { id: string; code: string }
  const global = await fetchJson<BttvEmote[]>(
    'https://api.betterttv.net/3/cached/emotes/global',
  )
  for (const e of global ?? []) {
    addEmote(map, e.code, `https://cdn.betterttv.net/emote/${e.id}/2x.webp`, 'bttv')
  }

  const user = await fetchJson<{
    channelEmotes?: BttvEmote[]
    sharedEmotes?: BttvEmote[]
  }>(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`)
  for (const e of [...(user?.channelEmotes ?? []), ...(user?.sharedEmotes ?? [])]) {
    // Channel-Emotes überschreiben Globals
    map.set(e.code, {
      code: e.code,
      url: `https://cdn.betterttv.net/emote/${e.id}/2x.webp`,
      provider: 'bttv',
    })
  }
}

async function loadFfz(map: EmoteMap, login: string): Promise<void> {
  type FfzEmote = {
    name: string
    urls: Record<string, string>
  }
  const global = await fetchJson<{
    default_sets?: number[]
    sets?: Record<string, { emoticons?: FfzEmote[] }>
  }>('https://api.frankerfacez.com/v1/set/global')
  for (const setId of global?.default_sets ?? []) {
    const set = global?.sets?.[String(setId)]
    for (const e of set?.emoticons ?? []) {
      const url = e.urls['2'] || e.urls['1'] || e.urls['4']
      if (url) addEmote(map, e.name, url, 'ffz')
    }
  }

  const room = await fetchJson<{
    room?: { set?: number }
    sets?: Record<string, { emoticons?: FfzEmote[] }>
  }>(`https://api.frankerfacez.com/v1/room/${encodeURIComponent(login)}`)
  const setId = room?.room?.set
  if (setId != null) {
    const set = room?.sets?.[String(setId)]
    for (const e of set?.emoticons ?? []) {
      const url = e.urls['2'] || e.urls['1'] || e.urls['4']
      if (!url) continue
      const absolute = url.startsWith('//') ? `https:${url}` : url
      map.set(e.name, { code: e.name, url: absolute, provider: 'ffz' })
    }
  }
}

async function load7tv(map: EmoteMap, twitchId: string): Promise<void> {
  type SevenFile = { name: string; format: string }
  type SevenEmote = {
    name: string
    data?: {
      host?: { url: string; files?: SevenFile[] }
    }
  }

  function pickUrl(emote: SevenEmote): string | null {
    const host = emote.data?.host
    if (!host?.url || !host.files?.length) return null
    const files = host.files
    const preferred =
      files.find((f) => f.name === '2x.webp') ||
      files.find((f) => f.name.endsWith('.webp') && f.name.includes('2x')) ||
      files.find((f) => f.name === '2x.png') ||
      files[files.length - 1]
    if (!preferred) return null
    const base = host.url.startsWith('//') ? `https:${host.url}` : host.url
    return `${base}/${preferred.name}`.replace(/([^:]\/)\/+/g, '$1')
  }

  const global = await fetchJson<{ emotes?: SevenEmote[] }>(
    'https://7tv.io/v3/emote-sets/global',
  )
  for (const e of global?.emotes ?? []) {
    const url = pickUrl(e)
    if (url) addEmote(map, e.name, url, '7tv')
  }

  const user = await fetchJson<{
    emote_set?: { emotes?: SevenEmote[] }
  }>(`https://7tv.io/v3/users/twitch/${twitchId}`)
  for (const e of user?.emote_set?.emotes ?? []) {
    const url = pickUrl(e)
    if (!url) continue
    map.set(e.name, { code: e.name, url, provider: '7tv' })
  }
}

/** Lädt BTTV + FFZ + 7TV (Channel + Global) */
export async function loadChannelEmotes(channelLogin: string): Promise<{
  map: EmoteMap
  providers: EmoteProvider[]
  twitchId: string | null
}> {
  const login = channelLogin.trim().replace(/^#/, '').toLowerCase()
  const map: EmoteMap = new Map()
  const providers: EmoteProvider[] = []
  const user = await resolveTwitchUser(login)

  await loadFfz(map, login)
  if (user?.id) {
    await Promise.all([loadBttv(map, user.id), load7tv(map, user.id)])
  } else {
    await loadBttvGlobalsOnly(map)
    await load7tvGlobalsOnly(map)
  }

  if ([...map.values()].some((e) => e.provider === 'bttv')) providers.push('bttv')
  if ([...map.values()].some((e) => e.provider === 'ffz')) providers.push('ffz')
  if ([...map.values()].some((e) => e.provider === '7tv')) providers.push('7tv')

  return { map, providers, twitchId: user?.id ?? null }
}

async function loadBttvGlobalsOnly(map: EmoteMap): Promise<void> {
  type BttvEmote = { id: string; code: string }
  const global = await fetchJson<BttvEmote[]>(
    'https://api.betterttv.net/3/cached/emotes/global',
  )
  for (const e of global ?? []) {
    addEmote(map, e.code, `https://cdn.betterttv.net/emote/${e.id}/2x.webp`, 'bttv')
  }
}

async function load7tvGlobalsOnly(map: EmoteMap): Promise<void> {
  type SevenFile = { name: string; format: string }
  type SevenEmote = {
    name: string
    data?: { host?: { url: string; files?: SevenFile[] } }
  }
  const global = await fetchJson<{ emotes?: SevenEmote[] }>(
    'https://7tv.io/v3/emote-sets/global',
  )
  for (const e of global?.emotes ?? []) {
    const host = e.data?.host
    if (!host?.url || !host.files?.length) continue
    const preferred =
      host.files.find((f) => f.name === '2x.webp') ||
      host.files[host.files.length - 1]
    const base = host.url.startsWith('//') ? `https:${host.url}` : host.url
    addEmote(map, e.name, `${base}/${preferred.name}`, '7tv')
  }
}

/** Twitch IRC emotes-Tag → Segmente */
export function parseTwitchEmoteRanges(
  text: string,
  emotesTag?: string | null,
): Array<{ type: 'text'; value: string } | { type: 'emote'; id: string; code: string }> {
  if (!emotesTag || !text) {
    return [{ type: 'text', value: text }]
  }

  type Range = { start: number; end: number; id: string }
  const ranges: Range[] = []
  for (const part of emotesTag.split('/')) {
    if (!part) continue
    const [id, positions] = part.split(':')
    if (!id || !positions) continue
    for (const pos of positions.split(',')) {
      const [a, b] = pos.split('-').map(Number)
      if (Number.isFinite(a) && Number.isFinite(b)) {
        ranges.push({ start: a, end: b, id })
      }
    }
  }
  ranges.sort((x, y) => x.start - y.start)

  const out: Array<
    { type: 'text'; value: string } | { type: 'emote'; id: string; code: string }
  > = []
  let cursor = 0
  for (const r of ranges) {
    if (r.start > cursor) {
      out.push({ type: 'text', value: text.slice(cursor, r.start) })
    }
    const code = text.slice(r.start, r.end + 1)
    out.push({ type: 'emote', id: r.id, code })
    cursor = r.end + 1
  }
  if (cursor < text.length) {
    out.push({ type: 'text', value: text.slice(cursor) })
  }
  return out.length ? out : [{ type: 'text', value: text }]
}

export function twitchEmoteUrl(id: string): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`
}
