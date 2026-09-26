/**
 * PAGE world. Spoofs visibility so background Shorts tabs still behave,
 * and handles advance requests from the extension isolate.
 */
(() => {
  const SOURCE = 'shortstogether-page'
  const RESERVED = new Set([
    'shorts',
    'feed',
    'channel',
    'user',
    'c',
    'clip',
    'live',
    'watch',
    'results',
    'playlist',
    'account',
    'upload',
  ])

  // --- Make YouTube think this tab is always visible / focused ---
  try {
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true,
    })
    Object.defineProperty(document, 'webkitHidden', {
      get: () => false,
      configurable: true,
    })
  } catch {
    /* ignore */
  }

  window.addEventListener(
    'visibilitychange',
    (event) => {
      event.stopImmediatePropagation()
    },
    true,
  )
  window.addEventListener(
    'webkitvisibilitychange',
    (event) => {
      event.stopImmediatePropagation()
    },
    true,
  )

  try {
    Document.prototype.hasFocus = () => true
  } catch {
    /* ignore */
  }

  // Some players check blur/focus on window
  window.addEventListener('blur', (event) => event.stopImmediatePropagation(), true)
  window.addEventListener(
    'focus',
    () => {
      /* allow */
    },
    true,
  )

  function isVideoId(value) {
    return (
      typeof value === 'string' &&
      /^[\w-]{11}$/.test(value) &&
      !RESERVED.has(value.toLowerCase())
    )
  }

  function currentId() {
    const id = location.pathname.match(/^\/shorts\/([\w-]{11})(?:\/|$|\?)/)?.[1]
    return isVideoId(id) ? id : null
  }

  function idFromHref(href) {
    if (!href) return null
    const match = String(href).match(
      /(?:youtube\.com)?\/shorts\/([\w-]{11})(?:\/|$|\?|&)/i,
    )
    const id = match?.[1]
    return isVideoId(id) ? id : null
  }

  function extractId(el) {
    if (!el) return null
    const href =
      el.getAttribute?.('href') ||
      el.querySelector?.('a[href*="/shorts/"]')?.getAttribute('href') ||
      ''
    const fromHref = idFromHref(href)
    if (fromHref) return fromHref

    const candidates = [
      el.getAttribute?.('data-video-id'),
      el.dataset?.videoId,
      el.__data?.videoId,
      el.__data?.data?.videoId,
      el.__data?.videoData?.videoId,
    ]
    for (const raw of candidates) {
      if (isVideoId(raw)) return raw
    }
    return null
  }

  function findNextId() {
    const current = currentId()
    const renderers = [...document.querySelectorAll('ytd-reel-video-renderer')]

    if (renderers.length) {
      let activeIdx = renderers.findIndex(
        (r) =>
          r.hasAttribute('is-active') ||
          r.hasAttribute('active') ||
          extractId(r) === current,
      )
      if (activeIdx < 0) activeIdx = 0
      for (let i = activeIdx + 1; i < renderers.length; i++) {
        const id = extractId(renderers[i])
        if (id && id !== current) return id
      }
    }

    const ids = []
    for (const a of document.querySelectorAll('a[href*="/shorts/"]')) {
      const id = idFromHref(a.getAttribute('href'))
      if (id && !ids.includes(id)) ids.push(id)
    }
    const idx = current ? ids.indexOf(current) : -1
    if (idx >= 0 && idx < ids.length - 1) return ids[idx + 1]
    return null
  }

  function clickDownButton() {
    const selectors = [
      '#navigation-button-down button',
      '#navigation-button-down yt-button-shape button',
      'ytd-shorts #navigation-button-down button',
      '#navigation-button-down',
    ]
    for (const sel of selectors) {
      const btn = document.querySelector(sel)
      if (btn) {
        btn.click()
        return true
      }
    }
    return false
  }

  function goToId(id) {
    if (!isVideoId(id)) return false
    if (id === currentId()) return false
    location.assign(`https://www.youtube.com/shorts/${id}`)
    return true
  }

  function scrollFeed() {
    const scroller =
      document.querySelector('#shorts-inner-container') ||
      document.querySelector('#shorts-container') ||
      document.querySelector('ytd-shorts')
    if (!scroller) return false
    scroller.scrollBy(0, Math.max(window.innerHeight, 700))
    return true
  }

  async function advance() {
    const before = currentId()

    if (clickDownButton()) {
      await new Promise((r) => setTimeout(r, 400))
      const after = currentId()
      if (after && after !== before) {
        window.postMessage({ source: SOURCE, type: 'st-advanced', videoId: after }, '*')
        return
      }
    }

    let nextId = findNextId()
    if (!nextId) {
      scrollFeed()
      await new Promise((r) => setTimeout(r, 500))
      if (clickDownButton()) {
        await new Promise((r) => setTimeout(r, 400))
        const after = currentId()
        if (after && after !== before) {
          window.postMessage({ source: SOURCE, type: 'st-advanced', videoId: after }, '*')
          return
        }
      }
      nextId = findNextId()
    }

    if (isVideoId(nextId) && goToId(nextId)) {
      window.postMessage({ source: SOURCE, type: 'st-advanced', videoId: nextId }, '*')
      return
    }

    window.postMessage(
      {
        source: SOURCE,
        type: 'st-advance-failed',
        reason: nextId ? 'invalid-next-id' : 'no-next-id',
      },
      '*',
    )
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (event.data?.source !== 'shortstogether-isolated') return
    if (event.data?.type === 'st-advance') void advance()
  })
})()
