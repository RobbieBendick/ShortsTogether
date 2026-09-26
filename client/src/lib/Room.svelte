<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import SharedPlayer from './SharedPlayer.svelte'
  import type { RoomState } from './types'
  import { appPath, withBase } from './paths'
  import { RoomSocket } from './ws'

  let { roomId: initialRoomId = null, create = false }: { roomId?: string | null; create?: boolean } =
    $props()

  let room = $state<RoomState | null>(null)
  let error = $state('')
  let copied = $state(false)
  let socket: RoomSocket | null = null

  const bridges = $derived(room?.bridges?.length ? room.bridges : [])
  const feedLabel = $derived.by(() => {
    if (!room?.feedOwnerId) return 'No YouTube feed connected'
    const bridge = room.bridges?.find((b) => b.clientId === room!.feedOwnerId)
    const member = room.members.find((m) => m.clientId === room!.feedOwnerId)
    const person = bridge || member
    return person ? `${person.name}'s YouTube` : 'Feed connected'
  })

  onMount(() => {
    socket = new RoomSocket(
      (state) => {
        room = state
        if (create && state.roomId && !appPath().startsWith('/room/')) {
          history.replaceState({}, '', withBase(`/room/${state.roomId}`))
          window.dispatchEvent(new PopStateEvent('popstate'))
        }
      },
      (message) => {
        error = message
      },
    )
    socket.connect(initialRoomId, create)
  })

  onDestroy(() => socket?.close())

  function next() {
    socket?.next()
  }

  function prev() {
    socket?.prev()
  }

  function pickFeed(clientId: string) {
    socket?.setFeedOwner(clientId)
  }

  async function copy() {
    if (!room) return
    const url = `${location.origin}${withBase(`/room/${room.roomId}`)}`
    await navigator.clipboard.writeText(url)
    copied = true
    setTimeout(() => {
      copied = false
    }, 1500)
  }
</script>

{#if error && !room}
  <div class="center">
    <p>{error}</p>
    <a href={withBase('/')}>Back</a>
  </div>
{:else if !room}
  <div class="center">Connecting…</div>
{:else}
  <div class="room">
    <header class="top">
      <a class="logo" href={withBase('/')}>ShortsTogether</a>
      <div class="meta">
        <span class="code">{room.roomId}</span>
        <span class="pill">{room.viewers} watching</span>
        <span class="pill feed">{feedLabel}</span>
        <button class="ghost" onclick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
    </header>

    {#if bridges.length}
      <div class="feeds">
        <span>Feed source:</span>
        {#each bridges as bridge}
          <button
            class:active={room.feedOwnerId === bridge.clientId}
            onclick={() => pickFeed(bridge.clientId)}
          >
            {bridge.name}
          </button>
        {/each}
      </div>
    {:else}
      <p class="need-bridge">
        Open the ShortsTogether extension on YouTube Shorts and join room
        <strong>{room.roomId}</strong> as a feed.
      </p>
    {/if}

    {#if error}
      <p class="banner">{error}</p>
    {/if}

    <div class="player-wrap">
      <SharedPlayer
        videoId={room.videoId}
        canGoPrev={room.historyLength > 0}
        onNext={next}
        onPrev={prev}
      />
    </div>
  </div>
{/if}

<style>
  .room {
    height: 100%;
    min-height: 100%;
    display: grid;
    grid-template-rows: auto auto 1fr;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem clamp(0.85rem, 2vw, 1.4rem);
  }

  .logo {
    font-family: var(--font-display);
    font-weight: 800;
    text-decoration: none;
    color: var(--bg-deep);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .code {
    font-family: ui-monospace, monospace;
    letter-spacing: 0.08em;
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
    background: var(--lime);
    font-weight: 700;
  }

  .pill {
    font-size: 0.82rem;
    color: var(--muted);
  }

  .pill.feed {
    color: var(--bg-deep);
    font-weight: 600;
  }

  .ghost {
    border: 1px solid var(--stroke);
    background: var(--panel);
    border-radius: 999px;
    padding: 0.35rem 0.75rem;
    font-weight: 600;
  }

  .feeds {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    padding: 0 1rem 0.5rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .feeds button {
    border: 1px solid var(--stroke);
    background: var(--panel);
    border-radius: 999px;
    padding: 0.35rem 0.75rem;
    font-weight: 700;
  }

  .feeds button.active {
    background: var(--bg-deep);
    color: var(--lime);
    border-color: transparent;
  }

  .need-bridge,
  .banner {
    margin: 0 1rem 0.5rem;
    font-size: 0.88rem;
    color: var(--muted);
  }

  .banner {
    color: #b42318;
  }

  .player-wrap {
    min-height: 0;
    padding: 0 1rem 1rem;
  }

  .center {
    min-height: 100%;
    display: grid;
    place-content: center;
    gap: 0.75rem;
    text-align: center;
    color: var(--muted);
  }

  @media (max-width: 720px) {
    .player-wrap {
      padding: 0;
    }
  }
</style>
