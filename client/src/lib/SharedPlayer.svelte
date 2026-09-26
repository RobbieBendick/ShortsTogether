<script lang="ts">
  import { onDestroy } from 'svelte'

  let {
    videoId,
    playing = true,
    position = 0,
    playbackAt = 0,
    canGoPrev = false,
    onNext,
    onPrev,
    onPlayback,
  }: {
    videoId: string | null
    playing?: boolean
    position?: number
    playbackAt?: number
    canGoPrev?: boolean
    onNext: () => void
    onPrev: () => void
    onPlayback: (playing: boolean, position: number, at: number) => void
  } = $props()

  let frameEl: HTMLDivElement | undefined = $state()
  let hostEl: HTMLDivElement | undefined = $state()
  let touchStartY = 0
  let wheelLock = false
  let volume = $state(80)
  let muted = $state(true)
  let soundUnlocked = $state(false)

  // Button / local authority — not overwritten until a NEWER remote clock arrives
  let uiPlaying = $state(true)
  let lastRemoteAt = 0
  let ignoreRemoteUntil = 0
  let mountedId: string | null = null
  let playRetryTimer: ReturnType<typeof setTimeout> | null = null
  let initializedUi = false

  $effect(() => {
    // Seed once from room when we first get playback props
    if (initializedUi) return
    playing
    playbackAt
    initializedUi = true
    uiPlaying = playing
    lastRemoteAt = playbackAt || 0
  })

  type YtPlayer = {
    destroy: () => void
    playVideo: () => void
    pauseVideo: () => void
    seekTo: (seconds: number, allowSeekAhead: boolean) => void
    getCurrentTime: () => number
    getPlayerState: () => number
    mute: () => void
    unMute: () => void
    setVolume: (v: number) => void
  }

  let player: YtPlayer | null = null
  const PLAYING = 1
  const ENDED = 0

  function getYt():
    | { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YtPlayer }
    | undefined {
    return (window as Window & { YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YtPlayer } }).YT
  }

  function loadApi(): Promise<void> {
    if (getYt()?.Player) return Promise.resolve()
    return new Promise((resolve) => {
      const w = window as Window & { onYouTubeIframeAPIReady?: () => void }
      const prev = w.onYouTubeIframeAPIReady
      w.onYouTubeIframeAPIReady = () => {
        prev?.()
        resolve()
      }
      if (!document.querySelector('script[data-yt]')) {
        const s = document.createElement('script')
        s.src = 'https://www.youtube.com/iframe_api'
        s.dataset.yt = '1'
        document.head.appendChild(s)
      }
    })
  }

  function expectedTime(pos: number, at: number, isPlaying: boolean) {
    if (!isPlaying || !at) return Math.max(0, pos)
    return Math.max(0, pos + (Date.now() - at) / 1000)
  }

  function clearPlayRetry() {
    if (playRetryTimer) {
      clearTimeout(playRetryTimer)
      playRetryTimer = null
    }
  }

  function ensurePlay() {
    clearPlayRetry()
    try {
      player?.playVideo()
    } catch {
      /* ignore */
    }
    // seekTo often leaves YT paused — nudge play again
    playRetryTimer = setTimeout(() => {
      try {
        if (uiPlaying) player?.playVideo()
      } catch {
        /* ignore */
      }
    }, 150)
  }

  function applyRemote(nextPlaying: boolean, pos: number, at: number) {
    if (!player) return
    const target = expectedTime(pos, at, nextPlaying)
    try {
      const current = player.getCurrentTime?.() ?? 0
      const drifted = Math.abs(current - target) > 1.25
      if (drifted) player.seekTo(target, true)

      if (nextPlaying) {
        if (drifted) ensurePlay()
        else player.playVideo()
      } else {
        clearPlayRetry()
        player.pauseVideo()
      }
    } catch {
      /* mid-load */
    }
  }

  function togglePlay() {
    if (!player) return
    unlockSound()

    const nextPlaying = !uiPlaying
    let t = 0
    try {
      t = player.getCurrentTime() || 0
    } catch {
      t = position
    }

    const at = Date.now()
    uiPlaying = nextPlaying
    // Block remote echoes / stale pauses from undoing this click
    lastRemoteAt = at
    ignoreRemoteUntil = at + 1000

    if (nextPlaying) ensurePlay()
    else {
      clearPlayRetry()
      try {
        player.pauseVideo()
      } catch {
        /* ignore */
      }
    }

    onPlayback(nextPlaying, t, at)
  }

  function unlockSound() {
    if (!player) return
    soundUnlocked = true
    muted = false
    try {
      player.unMute()
      player.setVolume(volume)
      if (uiPlaying) ensurePlay()
    } catch {
      /* ignore */
    }
  }

  function onVolumeInput(event: Event) {
    const value = Number((event.target as HTMLInputElement).value)
    volume = value
    if (!player) return
    player.setVolume(value)
    if (value === 0) {
      muted = true
      player.mute()
    } else {
      muted = false
      soundUnlocked = true
      player.unMute()
    }
  }

  function toggleMute() {
    if (!player) return
    if (muted || !soundUnlocked) {
      unlockSound()
      return
    }
    muted = true
    player.mute()
  }

  async function toggleFullscreen() {
    if (!frameEl) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await frameEl.requestFullscreen()
    } catch {
      /* ignore */
    }
  }

  async function mount(id: string) {
    await loadApi()
    const YT = getYt()
    if (!YT || !hostEl) return
    if (mountedId === id && player) return

    player?.destroy()
    clearPlayRetry()
    hostEl.innerHTML = ''
    const mountNode = document.createElement('div')
    hostEl.appendChild(mountNode)
    mountedId = id
    uiPlaying = playing
    lastRemoteAt = playbackAt || 0

    const startAt = expectedTime(position, playbackAt, playing)

    player = new YT.Player(mountNode, {
      videoId: id,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        mute: 1,
        start: Math.max(0, Math.floor(startAt)),
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        origin: location.origin,
      },
      events: {
        onReady: () => {
          try {
            player?.setVolume(volume)
            if (soundUnlocked && !muted) player?.unMute()
            else player?.mute()
          } catch {
            /* ignore */
          }
          applyRemote(uiPlaying, position, playbackAt || Date.now())
        },
        onStateChange: (e: { data: number }) => {
          if (e.data === ENDED) onNext()
          // Do not sync play/pause from YT events — that caused the pause loop
        },
      },
    })
  }

  $effect(() => {
    const id = videoId
    if (!id) {
      player?.destroy()
      player = null
      mountedId = null
      return
    }
    void mount(id)
  })

  // Remote updates only — never undo a fresh local click
  $effect(() => {
    const at = playbackAt
    const play = playing
    const pos = position
    if (!player) return
    if (!at) return
    if (at <= lastRemoteAt) return
    if (Date.now() < ignoreRemoteUntil) return

    lastRemoteAt = at
    uiPlaying = play
    applyRemote(play, pos, at)
  })

  onDestroy(() => {
    clearPlayRetry()
    player?.destroy()
    player = null
  })

  function onTouchStart(e: TouchEvent) {
    touchStartY = e.changedTouches[0]?.clientY ?? 0
  }

  function onTouchEnd(e: TouchEvent) {
    const endY = e.changedTouches[0]?.clientY ?? 0
    const dy = touchStartY - endY
    if (Math.abs(dy) < 56) return
    if (dy > 0) onNext()
    else onPrev()
  }

  function onWheel(e: WheelEvent) {
    if (Math.abs(e.deltaY) < 20 || wheelLock) return
    e.preventDefault()
    wheelLock = true
    if (e.deltaY > 0) onNext()
    else onPrev()
    setTimeout(() => {
      wheelLock = false
    }, 500)
  }
</script>

<section
  class="stage"
  role="application"
  aria-label="Shared Shorts player"
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
  onwheel={onWheel}
>
  {#if videoId}
    <div class="frame" bind:this={frameEl}>
      <div class="player" bind:this={hostEl}></div>

      {#if !soundUnlocked}
        <button class="unlock" type="button" onclick={unlockSound}>
          Tap to enable sound & sync
        </button>
      {/if}

      <div class="controls">
        <button
          class="ctrl play"
          type="button"
          onclick={togglePlay}
          aria-label={uiPlaying ? 'Pause for everyone' : 'Play for everyone'}
        >
          {uiPlaying ? '❚❚' : '▶'}
        </button>

        <div class="local">
          <button class="ctrl" type="button" onclick={toggleMute} aria-label="Mute">
            {muted || !soundUnlocked ? '🔇' : '🔊'}
          </button>
          <input
            class="vol"
            type="range"
            min="0"
            max="100"
            bind:value={volume}
            oninput={onVolumeInput}
            aria-label="Volume"
          />
          <button class="ctrl" type="button" onclick={toggleFullscreen} aria-label="Fullscreen">
            ⛶
          </button>
        </div>
      </div>
    </div>
  {:else}
    <div class="empty">
      <p>Waiting for a YouTube feed…</p>
      <p class="sub">Someone in the room should connect the Chrome extension on Shorts.</p>
    </div>
  {/if}

  <div class="chrome">
    <button class="nav" disabled={!canGoPrev} onclick={onPrev} aria-label="Previous">↑</button>
    <button class="nav" onclick={onNext} aria-label="Next">↓</button>
  </div>
</section>

<style>
  .stage {
    position: relative;
    height: 100%;
    min-height: 0;
    display: grid;
    place-items: center;
    touch-action: pan-x;
  }

  .frame {
    position: relative;
    width: min(100%, 420px);
    height: min(100%, 820px);
    aspect-ratio: 9 / 16;
    max-height: 100%;
    border-radius: 1.25rem;
    overflow: hidden;
    background: #000;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  }

  .player {
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .player :global(iframe) {
    width: 100%;
    height: 100%;
    border: 0;
  }

  .unlock {
    position: absolute;
    inset: 0;
    z-index: 5;
    border: 0;
    background: rgba(9, 13, 12, 0.72);
    color: var(--lime);
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 700;
    cursor: pointer;
  }

  .controls {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 0.9rem 1rem;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
  }

  .local {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .ctrl {
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(20, 28, 26, 0.85);
    color: #edf2f0;
    border-radius: 999px;
    width: 2.5rem;
    height: 2.5rem;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .ctrl.play {
    width: 3rem;
    height: 3rem;
    background: var(--accent);
    border-color: transparent;
    color: #fff;
  }

  .vol {
    width: 90px;
    accent-color: var(--lime);
  }

  .empty {
    width: min(100%, 420px);
    aspect-ratio: 9 / 16;
    max-height: 100%;
    display: grid;
    place-content: center;
    gap: 0.5rem;
    padding: 2rem;
    text-align: center;
    border-radius: 1.25rem;
    background: var(--solid);
    border: 1px solid var(--stroke);
    color: var(--lime);
    font-family: var(--font-display);
  }

  .empty p {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 650;
  }

  .sub {
    font-family: var(--font-body) !important;
    font-size: 0.9rem !important;
    font-weight: 500 !important;
    color: var(--muted) !important;
  }

  .chrome {
    position: absolute;
    right: clamp(0.5rem, 2vw, 1.25rem);
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    gap: 0.5rem;
  }

  .nav {
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 999px;
    border: 1px solid var(--stroke);
    background: rgba(20, 28, 26, 0.88);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--ink);
  }

  .nav:disabled {
    opacity: 0.35;
  }

  @media (max-width: 720px) {
    .frame,
    .empty {
      width: 100%;
      height: 100%;
      aspect-ratio: auto;
      border-radius: 0;
    }
  }
</style>
