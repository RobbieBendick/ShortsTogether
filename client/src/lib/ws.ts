import type { PlaybackState, RoomState } from './types'

const RENDER_WS = 'wss://shortstogetherbackend.onrender.com'

const DEFAULT_WS =
  import.meta.env.VITE_WS_URL?.trim() ||
  (typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'ws://localhost:3001'
    : RENDER_WS)

function clientId(): string {
  const key = 'st_client_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

function displayName(): string {
  return localStorage.getItem('st_name')?.trim() || 'Friend'
}

export function setDisplayName(name: string) {
  localStorage.setItem('st_name', name.trim().slice(0, 24) || 'Friend')
}

export function getDisplayName() {
  return displayName()
}

export function getServerUrl() {
  return localStorage.getItem('st_server') || DEFAULT_WS
}

export function setServerUrl(url: string) {
  localStorage.setItem('st_server', url)
}

type Handler = (state: RoomState) => void
type PlaybackHandler = (state: PlaybackState) => void
type ErrHandler = (message: string) => void

export class RoomSocket {
  private ws: WebSocket | null = null
  private onState: Handler
  private onPlayback: PlaybackHandler
  private onError: ErrHandler

  constructor(
    onState: Handler,
    onPlayback: PlaybackHandler = () => {},
    onError: ErrHandler = () => {},
  ) {
    this.onState = onState
    this.onPlayback = onPlayback
    this.onError = onError
  }

  connect(roomId: string | null, create: boolean) {
    this.close()
    const url = getServerUrl()
    this.ws = new WebSocket(url)

    this.ws.addEventListener('open', () => {
      const payload = create
        ? {
            type: 'create-room' as const,
            clientId: clientId(),
            name: displayName(),
            role: 'watcher' as const,
          }
        : {
            type: 'join-room' as const,
            roomId: roomId!,
            clientId: clientId(),
            name: displayName(),
            role: 'watcher' as const,
          }
      this.ws?.send(JSON.stringify(payload))
    })

    this.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(String(event.data))
        if (data.type === 'room-state') this.onState(data as RoomState)
        if (data.type === 'playback') this.onPlayback(data as PlaybackState)
        if (data.type === 'error') this.onError(data.message || 'Server error')
      } catch {
        /* ignore */
      }
    })
  }

  send(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  next() {
    this.send({ type: 'request-navigate', direction: 'next' })
  }

  prev() {
    this.send({ type: 'request-navigate', direction: 'prev' })
  }

  setFeedOwner(clientIdValue: string) {
    this.send({ type: 'set-feed-owner', clientId: clientIdValue })
  }

  sendPlayback(playing: boolean, position: number) {
    this.send({ type: 'playback', playing, position })
  }

  close() {
    this.ws?.close()
    this.ws = null
  }
}

export function myClientId() {
  return clientId()
}
