<script lang="ts">
  import { onMount } from 'svelte'
  import Landing from './lib/Landing.svelte'
  import Room from './lib/Room.svelte'
  import { appPath, withBase } from './lib/paths'

  let path = $state(typeof window !== 'undefined' ? appPath() : '/')
  let creating = $state(false)

  const roomId = $derived(path.match(/^\/room\/([a-z0-9]+)/i)?.[1]?.toLowerCase() ?? null)

  function go(to: string) {
    history.pushState({}, '', withBase(to))
    path = to
  }

  onMount(() => {
    const onPop = () => {
      path = appPath()
      creating = false
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  })

  async function handleCreate() {
    creating = true
  }

  async function handleJoin(code: string) {
    creating = false
    go(`/room/${code}`)
  }
</script>

{#if creating}
  <Room create={true} />
{:else if roomId}
  <Room roomId={roomId} />
{:else}
  <Landing onCreate={handleCreate} onJoin={handleJoin} />
{/if}
