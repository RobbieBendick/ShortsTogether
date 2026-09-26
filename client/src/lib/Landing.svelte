<script lang="ts">
  import { getDisplayName, getServerUrl, setDisplayName, setServerUrl } from './ws'

  let {
    onCreate,
    onJoin,
  }: {
    onCreate: () => void | Promise<void>
    onJoin: (code: string) => void | Promise<void>
  } = $props()

  let name = $state(getDisplayName() === 'Friend' ? '' : getDisplayName())
  let server = $state(getServerUrl())
  let code = $state('')
  let busy = $state(false)
  let error = $state('')

  function persist() {
    setDisplayName(name || 'Friend')
    setServerUrl(server.trim())
  }

  async function create() {
    persist()
    busy = true
    error = ''
    try {
      await onCreate()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not create room'
    } finally {
      busy = false
    }
  }

  async function join() {
    persist()
    const trimmed = code.trim().toLowerCase()
    if (!trimmed) {
      error = 'Enter a room code'
      return
    }
    busy = true
    error = ''
    try {
      await onJoin(trimmed)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not join'
    } finally {
      busy = false
    }
  }
</script>

<main class="landing">
  <header class="brand">
    <p class="mark">ShortsTogether</p>
    <h1>One shared Shorts player.</h1>
    <p class="lede">
      Like Watch2Gether — both of you watch the same screen. Pick whose YouTube
      algorithm feeds the next Short.
    </p>
  </header>

  <div class="actions">
    <label class="field">
      <span>Your name</span>
      <input bind:value={name} maxlength="24" placeholder="Alex" />
    </label>
    <label class="field">
      <span>Sync server</span>
      <input bind:value={server} spellcheck="false" placeholder="wss://….onrender.com" />
    </label>

    <button class="primary" disabled={busy} onclick={create}>
      {busy ? 'Opening…' : 'Start a room'}
    </button>

    <form
      class="join"
      onsubmit={(e) => {
        e.preventDefault()
        join()
      }}
    >
      <input bind:value={code} placeholder="Room code" maxlength="12" spellcheck="false" />
      <button type="submit" class="secondary" disabled={busy}>Join</button>
    </form>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  </div>

  <p class="hint">
    After you join, one person opens the Chrome extension on YouTube Shorts and
    connects as the feed for this room.
  </p>
</main>

<style>
  .landing {
    min-height: 100%;
    display: grid;
    align-content: center;
    gap: 2rem;
    padding: clamp(1.5rem, 4vw, 3rem);
    max-width: 40rem;
    margin: 0 auto;
  }

  .mark {
    margin: 0 0 1rem;
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 8vw, 4rem);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 0.95;
    color: var(--brand);
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(1.3rem, 3.5vw, 1.8rem);
    font-weight: 650;
    letter-spacing: -0.02em;
    max-width: 16ch;
    color: var(--ink);
  }

  .lede {
    margin: 0.85rem 0 0;
    color: var(--muted);
    line-height: 1.5;
    max-width: 36ch;
  }

  .actions {
    display: grid;
    gap: 0.75rem;
  }

  .field {
    display: grid;
    gap: 0.3rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
  }

  .field input,
  .join input {
    border: 1px solid var(--stroke);
    border-radius: 0.75rem;
    padding: 0.7rem 0.85rem;
    background: var(--panel);
    outline: none;
    color: var(--ink);
  }

  .field input:focus,
  .join input:focus {
    border-color: rgba(216, 255, 62, 0.45);
  }

  .primary,
  .secondary {
    border: none;
    border-radius: 999px;
    padding: 0.95rem 1.3rem;
    font-weight: 700;
  }

  .primary {
    background: var(--accent);
    color: #fff;
  }

  .primary:hover:not(:disabled) {
    background: #ff6e4f;
  }

  .join {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.45rem;
  }

  .secondary {
    background: var(--solid);
    color: var(--lime);
    border: 1px solid var(--stroke);
  }

  .error {
    margin: 0;
    color: var(--error);
  }

  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.92rem;
    max-width: 40ch;
  }
</style>
