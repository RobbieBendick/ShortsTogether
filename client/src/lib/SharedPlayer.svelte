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
    onPlayback: (playing: boolean, position: number) => void
  } = $props()

  let hostEl: HTMLDivElement | undefined = $state()
  let touchStartY = 0
  let wheelLock = false
  let applyingRemote = false
  let lastAppliedAt = 0
  let seekWatch: ReturnType<typeof setInterval> | null = null
  let lastLocalPos = 0
  let lastLocalAt = Date.now()

  type YtPlayer = {
    destroy: () => void
    loadVideoById: (id: string) => void
    playVideo: () => void
    pauseVideo: () => void
    seekTo: (seconds: number, allowSeekAhead: boolean) => void
    getCurrentTime: () => number
    getPlayerState: () => number
  }

  let player: YtPlayer | null = null

  const PLAYING = 1
  const PAUSED = 2
  const ENDED = 0

  function getYt():
    | {
        Player: new (
          el: HTMLElement,
          opts: Record<string, unknown>,
        ) => YtPlayer
      }
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
    if (!isPlaying || !at) return pos
    return pos + Math.max(0, (Date.now() - at) / 1000)
  }

  function applyRemote(force = false) {
    if (!player) return
    const target = expectedTime(position, playbackAt, playing)
    try {
      applyingRemote = true
      const current = player.getCurrentTime?.() ?? 0
      if (force || Math.abs(current - target) > 0.85) {
        player.seekTo(target, true)
      }
      const state = player.getPlayerState?.()
      if (playing && state !== PLAYING) player.playVideo()
      else if (!playing && state === PLAYING) player.pauseVideo()
    } catch {
      /* mid-load */
    } finally {
      queueMicrotask(() => {
        applyingRemote = false
      })
    }
  }

  function emitLocal(nextPlaying: boolean) {
    if (applyingRemote || !player) return
    try {
      const t = player.getCurrentTime() || 0
      lastLocalPos = t
      lastLocalAt = Date.now()
      onPlayback(nextPlaying, t)
    } catch {
      /* ignore */
    }
  }

  async function mount(id: string) {
    await loadApi()
    const YT = getYt()
    if (!YT || !hostEl) return
    player?.destroy()
    hostEl.innerHTML = ''
    const mountNode = document.createElement('div')
    hostEl.appendChild(mountNode)

    const startAt = expectedTime(position, playbackAt, playing)

    player = new YT.Player(mountNode, {
      videoId: id,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: playing ? 1 : 0,
        start: Math.floor(startAt),
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: location.origin,
      },
      events: {
        onReady: () => {
          lastAppliedAt = playbackAt
          lastLocalPos = startAt
          lastLocalAt = Date.now()
          applyRemote(true)
        },
        onStateChange: (e: { data: number }) => {
          if (applyingRemote || !player) return
          if (e.data === PLAYING) emitLocal(true)
          else if (e.data === PAUSED) emitLocal(false)
          else if (e.data === ENDED) onNext()
        },
      },
    })
  }

  $effect(() => {
    const id = videoId
    if (!id) {
      player?.destroy()
      player = null
      return
    }
    void mount(id)
  })

  $effect(() => {
    const token = playbackAt
    if (!player || !token || token === lastAppliedAt) return
    lastAppliedAt = token
    applyRemote()
  })

  $effect(() => {
    if (seekWatch) {
      clearInterval(seekWatch)
      seekWatch = null
    }
    // Detect scrubbing on the YouTube controls
    seekWatch = setInterval(() => {
      if (!player || applyingRemote) return
      try {
        const current = player.getCurrentTime() || 0
        const state = player.getPlayerState()
        const advancing = state === PLAYING
        const expected = advancing
          ? lastLocalPos + (Date.now() - lastLocalAt) / 1000
          : lastLocalPos
        if (Math.abs(current - expected) > 1.25) {
          lastLocalPos = current
          lastLocalAt = Date.now()
          onPlayback(advancing, current)
        } else {
          lastLocalPos = current
          lastLocalAt = Date.now()
        }
      } catch {
        /* ignore */
      }
    }, 1000)
  })

  onDestroy(() => {
    if (seekWatch) clearInterval(seekWatch)
    player?.destroy()
    player = null
  })

  function onTouchStart(e: TouchEvent) {
    touchStartY = e.changedTouches[0]?.clientY ?? 0
  }

  function onTouchEnd(e: TouchEvent) {
    const endY = e.changedTouches[0]?.clientY ?? 0
    const dy = touchStartY - endY
    if (Math.abs(dy) < 48) return
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
    <div class="frame">
      <div class="player" bind:this={hostEl}></div>
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
  }

  .player :global(iframe) {
    width: 100%;
    height: 100%;
    border: 0;
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
    opacity: 0.85;
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
    backdrop-filter: blur(8px);
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
