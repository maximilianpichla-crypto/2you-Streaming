import tmi from 'tmi.js'
import type { BrowserWindow } from 'electron'

export type ChatStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface ChatMessagePayload {
  id: string
  user: string
  color: string
  text: string
  system?: boolean
  /** Twitch IRC emotes-Tag */
  emotes?: string
  badgesRaw?: string
  badges?: Record<string, string>
  roomId?: string
}

export class TwitchChatService {
  private client: tmi.Client | null = null
  private channel = ''
  private window: BrowserWindow | null = null
  private status: ChatStatus = 'idle'

  setWindow(win: BrowserWindow | null): void {
    this.window = win
  }

  private send(channel: string, payload: unknown): void {
    if (!this.window || this.window.isDestroyed()) return
    this.window.webContents.send(channel, payload)
  }

  private setStatus(status: ChatStatus, error?: string | null): void {
    this.status = status
    this.send('chat:status', {
      status,
      channel: this.channel,
      error: error ?? null,
    })
  }

  getStatus(): { status: ChatStatus; channel: string } {
    return { status: this.status, channel: this.channel }
  }

  async connect(rawChannel: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const channel = rawChannel.trim().replace(/^#/, '').toLowerCase()
    if (!channel) {
      await this.disconnect()
      return { ok: true }
    }

    if (this.channel === channel && this.status === 'connected' && this.client) {
      return { ok: true }
    }

    await this.disconnect(false)

    this.channel = channel
    this.setStatus('connecting')
    this.send('chat:message', {
      id: `sys-${Date.now()}`,
      user: 'System',
      color: '#8b9bb0',
      text: `Verbinde mit #${channel}…`,
      system: true,
    } satisfies ChatMessagePayload)

    const client = new tmi.Client({
      options: { debug: false },
      connection: {
        reconnect: true,
        secure: true,
        server: 'irc-ws.chat.twitch.tv',
        port: 443,
      },
      channels: [channel],
    })
    this.client = client

    client.on('connected', () => {
      this.setStatus('connected')
      this.send('chat:message', {
        id: `sys-ok-${Date.now()}`,
        user: 'System',
        color: '#3ecf8e',
        text: `Chat verbunden: #${channel}`,
        system: true,
      } satisfies ChatMessagePayload)
    })

    client.on('disconnected', (reason) => {
      if (this.client !== client) return
      if (this.status === 'connecting') return
      this.setStatus('idle')
      if (reason) {
        this.send('chat:message', {
          id: `sys-dc-${Date.now()}`,
          user: 'System',
          color: '#8b9bb0',
          text: `Getrennt: ${reason}`,
          system: true,
        } satisfies ChatMessagePayload)
      }
    })

    client.on('message', (_ch, tags, message, self) => {
      if (self) return
      const badges = tags.badges
        ? (Object.fromEntries(
            Object.entries(tags.badges).filter(
              (entry): entry is [string, string] => entry[1] != null,
            ),
          ) as Record<string, string>)
        : undefined
      this.send('chat:message', {
        id: tags.id || `msg-${Date.now()}-${Math.random()}`,
        user: tags['display-name'] || tags.username || 'user',
        color: tags.color || '#3d9cf0',
        text: message,
        emotes: tags['emotes-raw'] || undefined,
        badgesRaw: tags['badges-raw'] || undefined,
        badges,
        roomId: tags['room-id'] || undefined,
      } satisfies ChatMessagePayload)
    })

    client.on('notice', (_ch, _msgid, message) => {
      this.send('chat:message', {
        id: `notice-${Date.now()}`,
        user: 'Twitch',
        color: '#e8a23d',
        text: message,
        system: true,
      } satisfies ChatMessagePayload)
    })

    try {
      await client.connect()
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.client = null
      this.setStatus('error', message)
      return { ok: false, error: message }
    }
  }

  async disconnect(emitIdle = true): Promise<void> {
    const client = this.client
    this.client = null
    this.channel = ''
    if (client) {
      try {
        client.removeAllListeners()
        await client.disconnect()
      } catch {
        // ignore
      }
    }
    if (emitIdle) this.setStatus('idle')
  }
}
