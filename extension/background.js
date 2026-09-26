const DEFAULT_SERVER = 'wss://shortstogetherbackend.onrender.com'

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['serverUrl'], (result) => {
    if (!result.serverUrl) {
      chrome.storage.local.set({ serverUrl: DEFAULT_SERVER })
    }
  })
})

/**
 * Briefly focus the Shorts tab so YouTube processes "next", then jump back
 * to whatever tab the user was on (usually the shared web player).
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'st-flash-focus') return

  const shortsTabId = sender.tab?.id
  const shortsWindowId = sender.tab?.windowId
  if (shortsTabId == null) {
    sendResponse({ ok: false, reason: 'no-tab' })
    return
  }

  ;(async () => {
    try {
      const [active] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      const previousTabId = active?.id
      const previousWindowId = active?.windowId

      if (shortsWindowId != null) {
        await chrome.windows.update(shortsWindowId, { focused: true })
      }
      await chrome.tabs.update(shortsTabId, { active: true })

      // Let YouTube paint / unthrottle before the page script advances
      await new Promise((r) => setTimeout(r, 120))

      sendResponse({
        ok: true,
        previousTabId:
          previousTabId != null && previousTabId !== shortsTabId
            ? previousTabId
            : null,
        previousWindowId:
          previousWindowId != null && previousWindowId !== shortsWindowId
            ? previousWindowId
            : shortsWindowId ?? null,
      })
    } catch (error) {
      sendResponse({
        ok: false,
        reason: error instanceof Error ? error.message : 'focus-failed',
      })
    }
  })()

  return true
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'st-restore-focus') return

  ;(async () => {
    try {
      if (message.previousWindowId != null) {
        await chrome.windows.update(message.previousWindowId, { focused: true })
      }
      if (message.previousTabId != null) {
        await chrome.tabs.update(message.previousTabId, { active: true })
      }
      sendResponse({ ok: true })
    } catch (error) {
      sendResponse({
        ok: false,
        reason: error instanceof Error ? error.message : 'restore-failed',
      })
    }
  })()

  return true
})
