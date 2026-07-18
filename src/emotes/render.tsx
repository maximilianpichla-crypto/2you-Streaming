import type { ReactNode } from 'react'
import { createElement, Fragment } from 'react'
import type { EmoteMap } from './providers'
import { parseTwitchEmoteRanges, twitchEmoteUrl } from './providers'

function renderThirdPartyText(text: string, emotes: EmoteMap, keyPrefix: string): ReactNode[] {
  if (!text) return []
  // Split keeping whitespace
  const parts = text.split(/(\s+)/)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-t-${i}`
    if (!part || /^\s+$/.test(part)) {
      return createElement(Fragment, { key }, part)
    }
    // Strip common trailing punctuation for lookup
    const match = part.match(/^(.+?)([.,!?;:]+)?$/)
    const core = match?.[1] ?? part
    const trail = match?.[2] ?? ''
    const emote = emotes.get(core)
    if (emote) {
      return createElement(
        Fragment,
        { key },
        createElement('img', {
          className: 'chat-emote',
          src: emote.url,
          alt: emote.code,
          title: `${emote.code} (${emote.provider})`,
          loading: 'lazy',
        }),
        trail,
      )
    }
    return createElement(Fragment, { key }, part)
  })
}

export function renderChatMessage(
  text: string,
  emotes: EmoteMap,
  twitchEmotesTag?: string | null,
): ReactNode {
  const segments = parseTwitchEmoteRanges(text, twitchEmotesTag)
  const nodes: ReactNode[] = []

  segments.forEach((seg, i) => {
    if (seg.type === 'emote') {
      nodes.push(
        createElement('img', {
          key: `tw-${i}`,
          className: 'chat-emote',
          src: twitchEmoteUrl(seg.id),
          alt: seg.code,
          title: seg.code,
          loading: 'lazy',
        }),
      )
    } else {
      nodes.push(...renderThirdPartyText(seg.value, emotes, `p${i}`))
    }
  })

  return createElement(Fragment, null, ...nodes)
}
