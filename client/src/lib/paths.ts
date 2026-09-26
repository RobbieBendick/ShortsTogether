/** App base path for GitHub Pages (e.g. `/ShortsTogether/`). Always ends with `/`. */
export const BASE = import.meta.env.BASE_URL || '/'

export function withBase(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (BASE === '/') return normalized
  return `${BASE.replace(/\/$/, '')}${normalized}`
}

/** Pathname relative to BASE, always starting with `/`. */
export function appPath(pathname = window.location.pathname): string {
  if (BASE === '/') return pathname || '/'
  const prefix = BASE.replace(/\/$/, '')
  if (pathname === prefix || pathname === `${prefix}/`) return '/'
  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length) || '/'
  }
  return pathname || '/'
}
