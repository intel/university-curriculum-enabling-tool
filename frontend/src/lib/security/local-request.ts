const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1'])

export function isAllowedLocalRequest(request: Pick<Request, 'url' | 'headers'>): boolean {
  let requestUrl: URL
  try {
    requestUrl = new URL(request.url)
  } catch {
    return false
  }

  if (!['http:', 'https:'].includes(requestUrl.protocol)) {
    return false
  }

  const hostHeader = request.headers.get('host')
  let effectiveOrigin: URL
  try {
    effectiveOrigin = new URL(`${requestUrl.protocol}//${hostHeader || requestUrl.host}`)
  } catch {
    return false
  }
  if (
    effectiveOrigin.username ||
    effectiveOrigin.password ||
    effectiveOrigin.pathname !== '/' ||
    !LOOPBACK_HOSTNAMES.has(effectiveOrigin.hostname)
  ) {
    return false
  }

  const isApiRequest = requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')
  if (!isApiRequest) return true

  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).origin !== effectiveOrigin.origin) return false
    } catch {
      return false
    }
  }

  return request.headers.get('sec-fetch-site') !== 'cross-site'
}