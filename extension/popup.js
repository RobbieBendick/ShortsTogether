const nameInput = document.getElementById('name-input')
const serverInput = document.getElementById('server-input')
const codeInput = document.getElementById('code')
const connectBtn = document.getElementById('connect')
const openShortsBtn = document.getElementById('open-shorts')
const leaveBtn = document.getElementById('leave')
const statusEl = document.getElementById('status')

const DEFAULT_SERVER = 'ws://localhost:3001'

function setStatus(text) {
  statusEl.textContent = text
}

function normalizeServerUrl(raw) {
  const value = raw.trim().replace(/\/$/, '')
  if (!value) return DEFAULT_SERVER
  if (value.startsWith('ws://') || value.startsWith('wss://')) return value
  if (value.startsWith('https://')) return `wss://${value.slice('https://'.length)}`
  if (value.startsWith('http://')) return `ws://${value.slice('http://'.length)}`
  return `wss://${value}`
}

async function storageGet(keys) {
  return chrome.storage.local.get(keys)
}

async function storageSet(values) {
  return chrome.storage.local.set(values)
}

async function ensureClientId() {
  const { clientId } = await storageGet(['clientId'])
  if (clientId) return clientId
  const id = crypto.randomUUID()
  await storageSet({ clientId: id })
  return id
}

function connectOnce(serverUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(serverUrl)
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error('Sync server timed out'))
    }, 8000)
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('Could not reach sync server'))
    })
  })
}

function request(ws, payload) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'room-state') {
          cleanup()
          resolve(data)
        } else if (data.type === 'error') {
          cleanup()
          reject(new Error(data.message || 'Server error'))
        }
      } catch {
        /* ignore */
      }
    }
    const cleanup = () => {
      ws.removeEventListener('message', onMessage)
      clearTimeout(timer)
      ws.close()
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('No response from server'))
    }, 8000)
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify(payload))
  })
}

connectBtn.addEventListener('click', async () => {
  try {
    const serverUrl = normalizeServerUrl(serverInput.value)
    const displayName = nameInput.value.trim() || 'YouTube'
    const roomId = codeInput.value.trim().toLowerCase()
    if (!roomId) {
      setStatus('Enter the room code from the website')
      return
    }
    setStatus('Connecting feed…')
    const clientId = await ensureClientId()
    const ws = await connectOnce(serverUrl)
    await request(ws, {
      type: 'join-room',
      roomId,
      clientId,
      name: displayName,
      role: 'bridge',
    })
    serverInput.value = serverUrl
    // Write clientId before roomId so the content script never joins without it
    await storageSet({ serverUrl, displayName, clientId })
    await storageSet({ roomId })
    setStatus(`Feed connected to ${roomId}. Keep Shorts open.`)
    chrome.tabs.query({ url: 'https://www.youtube.com/shorts*' }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id != null) chrome.tabs.reload(tab.id)
      }
    })  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Failed')
  }
})

openShortsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.youtube.com/shorts' })
})

leaveBtn.addEventListener('click', async () => {
  await storageSet({ roomId: null })
  setStatus('Disconnected')
})

storageGet(['roomId', 'serverUrl', 'displayName']).then((data) => {
  serverInput.value = normalizeServerUrl(data.serverUrl || DEFAULT_SERVER)
  nameInput.value = data.displayName || ''
  codeInput.value = data.roomId || ''
  if (data.roomId) setStatus(`Linked to room ${data.roomId} — keep Shorts open.`)
})
