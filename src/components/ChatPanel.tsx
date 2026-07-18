import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatStatusPayload } from '../shared/types'
import { loadChannelEmotes, type EmoteMap, type EmoteProvider } from '../emotes/providers'
import { renderChatMessage } from '../emotes/render'
import {
  loadChannelBadges,
  loadGlobalBadges,
  mergeBadgeMaps,
  resolveBadges,
  type BadgeSetMap,
} from '../chat/badges'

interface Props {
  channelName: string
  onChannelChange: (name: string) => void
  embedded?: boolean
}

function normalizeChannel(name: string): string {
  return name.trim().replace(/^#/, '').toLowerCase()
}

export function ChatPanel({ channelName, onChannelChange, embedded = false }: Props) {
  const [draft, setDraft] = useState(channelName)
  const [activeChannel, setActiveChannel] = useState('')
  const [status, setStatus] = useState<ChatStatusPayload['status']>('idle')
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [emotes, setEmotes] = useState<EmoteMap>(new Map())
  const [emoteProviders, setEmoteProviders] = useState<EmoteProvider[]>([])
  const [emotesLoading, setEmotesLoading] = useState(false)
  const [badgeMap, setBadgeMap] = useState<BadgeSetMap>(new Map())
  const loadedRoomId = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const connectGen = useRef(0)

  useEffect(() => {
    setDraft(channelName)
  }, [channelName])

  useEffect(() => {
    const normalized = normalizeChannel(draft)
    const timer = window.setTimeout(() => {
      if (normalized !== normalizeChannel(channelName)) {
        onChannelChange(normalized)
      }
      setActiveChannel(normalized)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [draft, channelName, onChannelChange])

  useEffect(() => {
    const unsubStatus = window.twoYou.onChatStatus((payload) => {
      setStatus(payload.status)
      setError(payload.error)
    })
    const unsubMsg = window.twoYou.onChatMessage((msg) => {
      setMessages((prev) => [...prev, msg].slice(-200))
      if (msg.roomId && msg.roomId !== loadedRoomId.current) {
        loadedRoomId.current = msg.roomId
        void loadChannelBadges(msg.roomId).then((channelBadges) => {
          setBadgeMap((prev) => mergeBadgeMaps(prev, channelBadges))
        })
      }
    })
    return () => {
      unsubStatus()
      unsubMsg()
    }
  }, [])

  useEffect(() => {
    const channel = normalizeChannel(activeChannel)
    const gen = ++connectGen.current

    if (!channel) {
      void window.twoYou.disconnectChat()
      setStatus('idle')
      setError(null)
      setMessages([])
      setEmotes(new Map())
      setEmoteProviders([])
      setBadgeMap(new Map())
      loadedRoomId.current = null
      return
    }

    setMessages([])
    setError(null)
    setStatus('connecting')
    setEmotesLoading(true)
    setEmoteProviders([])
    loadedRoomId.current = null

    const timer = window.setTimeout(() => {
      if (connectGen.current !== gen) return
      void window.twoYou.connectChat(channel).then((result) => {
        if (connectGen.current !== gen) return
        if (!result.ok) {
          setStatus('error')
          setError(result.error)
        }
      })
    }, 150)

    void loadGlobalBadges().then((globalBadges) => {
      if (connectGen.current !== gen) return
      setBadgeMap(globalBadges)
    })

    void loadChannelEmotes(channel)
      .then((result) => {
        if (connectGen.current !== gen) return
        setEmotes(result.map)
        setEmoteProviders(result.providers)
      })
      .catch(() => {
        if (connectGen.current !== gen) return
        setEmotes(new Map())
        setEmoteProviders([])
      })
      .finally(() => {
        if (connectGen.current !== gen) return
        setEmotesLoading(false)
      })

    return () => {
      window.clearTimeout(timer)
    }
  }, [activeChannel])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const statusLabel =
    status === 'connected'
      ? 'Live'
      : status === 'connecting'
        ? 'Verbinde…'
        : status === 'error'
          ? 'Fehler'
          : 'Wartend'

  const providerLabel = emotesLoading
    ? 'Emotes laden…'
    : emoteProviders.length
      ? emoteProviders.map((p) => p.toUpperCase()).join(' · ')
      : activeChannel
        ? 'Emotes: —'
        : ''

  return (
    <div className={`panel chat-panel ${embedded ? 'embedded' : ''}`}>
      {!embedded && <div className="panel-header">Chat</div>}
      <div className="panel-body chat-body">
        <div className="field" style={{ marginBottom: '0.55rem' }}>
          <label htmlFor="streamer-name">Streamername (Twitch)</label>
          <input
            id="streamer-name"
            value={draft}
            placeholder="z. B. shroud"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>

        <div className="chat-status-row">
          <span className={`live-dot ${status === 'connected' ? 'on' : ''}`} />
          <span>
            {statusLabel}
            {activeChannel ? ` · #${activeChannel}` : ''}
          </span>
        </div>
        {activeChannel && (
          <div className="chat-emote-status">{providerLabel}</div>
        )}

        {error && <div className="error-box">{error}</div>}

        <div className="chat-messages" ref={listRef}>
          {!activeChannel && (
            <div className="chat-empty">
              Streamernamen eingeben — der Chat verbindet sich automatisch.
              Emotes von 7TV, FFZ und BTTV werden geladen. Badges (Mod, VIP, …)
              erscheinen mit.
            </div>
          )}
          {messages.map((msg) => {
            const badges = msg.system
              ? []
              : resolveBadges(msg.badgesRaw, msg.badges, badgeMap)
            return (
              <div key={msg.id} className={`chat-line ${msg.system ? 'system' : ''}`}>
                {badges.length > 0 && (
                  <span className="chat-badges">
                    {badges.map((b) => (
                      <img
                        key={`${b.set}-${b.version}`}
                        className="chat-badge"
                        src={b.url}
                        alt={b.title}
                        title={b.title}
                        loading="lazy"
                      />
                    ))}
                  </span>
                )}
                <span className="chat-user" style={{ color: msg.color }}>
                  {msg.user}
                </span>
                <span className="chat-text">
                  {msg.system
                    ? msg.text
                    : renderChatMessage(msg.text, emotes, msg.emotes)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
