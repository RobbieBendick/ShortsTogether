export {}

declare namespace YT {
  class Player {
    constructor(element: HTMLElement | string, options: PlayerOptions)
    destroy(): void
    playVideo(): void
    pauseVideo(): void
    seekTo(seconds: number, allowSeekAhead: boolean): void
    getCurrentTime(): number
    getPlayerState(): number
  }

  interface PlayerOptions {
    videoId?: string
    width?: string | number
    height?: string | number
    playerVars?: Record<string, string | number>
    events?: {
      onReady?: (event: PlayerEvent) => void
      onStateChange?: (event: OnStateChangeEvent) => void
    }
  }

  interface PlayerEvent {
    target: Player
  }

  interface OnStateChangeEvent {
    data: number
    target: Player
  }

  const PlayerState: {
    UNSTARTED: -1
    ENDED: 0
    PLAYING: 1
    PAUSED: 2
    BUFFERING: 3
    CUED: 5
  }
}

interface Window {
  YT?: {
    Player: typeof YT.Player
    PlayerState: typeof YT.PlayerState
  }
  onYouTubeIframeAPIReady?: () => void
}
