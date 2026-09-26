;(() => {
  const BADGE_ID = 'st-badge'

  let ws = null
  let roomId = null
  let serverUrl = 'wss://shortstogetherbackend.onrender.com'
  let clientId = null
  let displayName = 'YouTube'
  let reconnectTimer = null
  let lastEmitted = null
  let suppressUntil = 0
  let lastPath = location.pathname
  let feedOwnerId = null
  let booted = false

  function isShortsPath(pathname = location.pathname) {
    return pathname.startsWith('/shorts')
  }

  function currentVideoId() {
    const match = location.pathname.match(/^\/shorts\/([\w-]{11})(?:\/|$)/)
    const id = match?.[1]
    if (!id || id.toLowerCase() === 'shorts') return null
    return id
  }

  function amFeedOwner() {
    return Boolean(clientId && feedOwnerId && clientId === feedOwnerId)
  }

  function ensureBadge() {
    let el = document.getElementById(BADGE_ID)
    if (el) return el
    el = document.createElement('div')
    el.id = BADGE_ID
    el.innerHTML = `
      <strong>ShortsTogether Feed</strong>
      <span data-st="meta">Not connected</span>
    `
    document.documentElement.appendChild(el)
    return el
  }

  function setBadge(text, connected) {
    if (!isShortsPath()) {
      document.getElementById(BADGE_ID)?.remove()
      return
    }
    const el = ensureBadge()
    el.dataset.connected = connected ? '1' : '0'
    el.dataset.owner = amFeedOwner() ? '1' : '0'
    const meta = el.querySelector('[data-st="meta"]')
    if (meta) meta.textContent = text
  }

  function send(payload) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
    }
  }

  function emitCurrentIfNeeded() {
    if (!roomId || Date.now() < suppressUntil) return
    if (!amFeedOwner()) return
    const id = currentVideoId()
    if (!id || id === lastEmitted) return
    lastEmitted = id
    send({ type: 'set-video', videoId: id })
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function requestPageAdvance() {
    window.postMessage({ source: 'shortstogether-isolated', type: 'st-advance' }, '*')
  }

  function flashFocusShortsTab() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'st-flash-focus' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null)
            return
          }
          resolve(response?.ok ? response : null)
        })
      } catch {
        resolve(null)
      }
    })
  }

  function restoreFocus(focusInfo) {
    if (!focusInfo?.previousTabId && focusInfo?.previousWindowId == null) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          {
            type: 'st-restore-focus',
            previousTabId: focusInfo.previousTabId,
            previousWindowId: focusInfo.previousWindowId,
          },
          () => resolve(),
        )
      } catch {
        resolve()
      }
    })
  }

  async function advanceLocalShort() {
    const before = currentVideoId()
    setBadge(`Room ${roomId} · advancing…`, true)

    // Background tabs get throttled — briefly focus Shorts, advance, then return.
    const focusInfo = await flashFocusShortsTab()
    await sleep(80)
    requestPageAdvance()

    let succeeded = false
    for (let i = 0; i < 24; i++) {
      await sleep(150)
      const now = currentVideoId()
      if (now && now !== before) {
        succeeded = true
        if (now !== lastEmitted) {
          lastEmitted = now
          send({ type: 'set-video', videoId: now })
        } else {
          emitCurrentIfNeeded()
        }
        break
      }
    }

    await restoreFocus(focusInfo)

    if (succeeded) {
      setBadge(`Room ${roomId} · YOU are the feed · stay on Shorts`, true)
    } else {
      setBadge(`Room ${roomId} · next failed — refresh Shorts & retry`, true)
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (event.data?.source !== 'shortstogether-page') return
    if (event.data.type === 'st-advanced' && event.data.videoId) {
      const id = event.data.videoId
      if (id && id !== lastEmitted && amFeedOwner()) {
        lastEmitted = id
        send({ type: 'set-video', videoId: id })
      }
    }
    if (event.data.type === 'st-advance-failed') {
      setBadge(
        `Room ${roomId} · next failed (${event.data.reason || 'unknown'})`,
        true,
      )
    }
  })

  function handleMessage(data) {
    if (data.type === 'room-state') {
      roomId = data.roomId
      feedOwnerId = data.feedOwnerId ?? null
      const status = amFeedOwner()
        ? `Room ${roomId} · YOU are the feed · stay on Shorts`
        : `Room ${roomId} · bridged (not active feed)`
      setBadge(status, true)
      if (amFeedOwner()) emitCurrentIfNeeded()
      return
    }

    if (data.type === 'advance' && data.direction === 'next') {
      setBadge(`Room ${roomId} · got Next from site…`, true)
      if (!amFeedOwner()) {
        setBadge(`Room ${roomId} · Next ignored (not active feed)`, false)
        return
      }
      void advanceLocalShort()
      return
    }

    if (data.type === 'error') {
      setBadge(data.message || 'Error', false)
      // Retry once with a fresh join if credentials were racing
      if (String(data.message || '').includes('Missing')) {
        scheduleReconnect(800)
      }
    }
  }

  function connect() {
    if (!booted) return
    if (!isShortsPath()) return

    if (!roomId) {
      setBadge('Join a room in the extension popup', false)
      return
    }
    if (!clientId) {
      setBadge('Missing client id — reopen the extension popup', false)
      return
    }

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    setBadge(`Connecting feed to ${roomId}…`, false)
    try {
      ws = new WebSocket(serverUrl)
    } catch {
      setBadge('Bad sync server URL', false)
      scheduleReconnect()
      return
    }

    const joiningRoom = roomId
    const joiningClient = clientId
    const joiningName = displayName

    ws.addEventListener('open', () => {
      if (!joiningRoom || !joiningClient) {
        setBadge('Missing room or client id', false)
        return
      }
      send({
        type: 'join-room',
        roomId: joiningRoom,
        clientId: joiningClient,
        name: joiningName,
        role: 'bridge',
      })
    })

    ws.addEventListener('message', (event) => {
      try {
        handleMessage(JSON.parse(event.data))
      } catch {
        /* ignore */
      }
    })

    ws.addEventListener('close', () => {
      setBadge(roomId ? `Reconnecting feed ${roomId}…` : 'Disconnected', false)
      scheduleReconnect()
    })
  }

  function scheduleReconnect(delay = 1500) {
    clearTimeout(reconnectTimer)
    if (!roomId) return
    reconnectTimer = setTimeout(() => {
      disconnect(false)
      connect()
    }, delay)
  }

  function disconnect(clearTimer = true) {
    if (clearTimer) clearTimeout(reconnectTimer)
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }
  }

  function onPossibleNavigation() {
    if (!isShortsPath()) {
      document.getElementById(BADGE_ID)?.remove()
      return
    }
    if (location.pathname !== lastPath) lastPath = location.pathname
    emitCurrentIfNeeded()
  }

  document.addEventListener('yt-navigate-finish', onPossibleNavigation)
  document.addEventListener('yt-page-data-updated', onPossibleNavigation)
  window.addEventListener('popstate', onPossibleNavigation)
  setInterval(onPossibleNavigation, 400)

  function applyStorage(result) {
    if (result.serverUrl) serverUrl = result.serverUrl
    if (result.displayName) displayName = result.displayName
    if (result.clientId) clientId = result.clientId
    if (Object.prototype.hasOwnProperty.call(result, 'roomId')) {
      roomId = result.roomId || null
    }
  }

  chrome.storage.local.get(['roomId', 'serverUrl', 'clientId', 'displayName'], (result) => {
    applyStorage(result)
    if (!clientId) {
      clientId = crypto.randomUUID()
      chrome.storage.local.set({ clientId })
    }
    booted = true
    if (isShortsPath()) connect()
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return

    // Apply ALL updates first — then connect once (avoids roomId-before-clientId race)
    if (changes.serverUrl) serverUrl = changes.serverUrl.newValue || serverUrl
    if (changes.displayName) displayName = changes.displayName.newValue || displayName
    if (changes.clientId) clientId = changes.clientId.newValue || clientId
    if (changes.roomId) {
      roomId = changes.roomId.newValue || null
      lastEmitted = null
      feedOwnerId = null
    }

    if (!booted) return

    const shouldReconnect =
      Boolean(changes.serverUrl) ||
      Boolean(changes.roomId) ||
      Boolean(changes.clientId)

    if (shouldReconnect) {
      disconnect()
      if (roomId && isShortsPath()) connect()
      else if (isShortsPath()) setBadge('Join a room in the extension popup', false)
      else document.getElementById(BADGE_ID)?.remove()
    }
  })
})()
