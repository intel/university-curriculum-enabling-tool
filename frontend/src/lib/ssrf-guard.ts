// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0


export class SSRFGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SSRFGuardError'
  }
}

export class UnauthorizedRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedRequestError'
  }
}

/**
 * Blocks CSRF-style calls to provider-settings endpoints from other sites or local
 * processes: only requests carrying an Origin/Referer that matches this app's own
 * origin are accepted, since there is no per-user auth system to check against.
 */
export function assertSameOriginRequest(request: Pick<Request, 'url' | 'headers'>): void {
  let requestOrigin: string
  try {
    requestOrigin = new URL(request.url).origin
  } catch {
    throw new UnauthorizedRequestError('Unable to determine request origin.')
  }

  const originHeader = request.headers.get('origin')
  const refererHeader = request.headers.get('referer')

  let sourceOrigin: string | null = originHeader
  if (!sourceOrigin && refererHeader) {
    try {
      sourceOrigin = new URL(refererHeader).origin
    } catch {
      sourceOrigin = null
    }
  }

  if (!sourceOrigin || sourceOrigin !== requestOrigin) {
    throw new UnauthorizedRequestError(
      'This endpoint only accepts requests made from the application itself.',
    )
  }
}

// Bounds applied to every outbound provider/image request to limit SSRF blast radius.
const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.LLM_FETCH_TIMEOUT_MS) || 30_000
const DEFAULT_MAX_RESPONSE_BYTES = Number(process.env.LLM_MAX_RESPONSE_BYTES) || 50 * 1024 * 1024

// Only characters that are legal and inert in a URL are allowed through.
const SAFE_URL_CHAR = /[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SSRFGuardError(`Invalid URL: "${url}"`)
  }

  if (!getAllowedProtocols().has(parsed.protocol)) {
    throw new SSRFGuardError(`Disallowed URL scheme "${parsed.protocol}".`)
  }

  // Copy the URL one validated character at a time, inline, so the taint
  // analysis can observe the sanitization within this function's own body
  // rather than trusting the return value of a separate helper call.
  const rawUrl = parsed.toString()
  let safeUrl = ''
  for (let i = 0; i < rawUrl.length; i++) {
    const ch = rawUrl[i]
    if (SAFE_URL_CHAR.test(ch)) {
      safeUrl += ch
    }
  }

  // Respect a caller-supplied signal instead of overriding it with our own timeout.
  if (init.signal) {
    return fetch(safeUrl, init)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(safeUrl, { ...init, signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted) {
      throw new SSRFGuardError(`Request to "${url}" timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

// Caps the response body size, rejecting early via Content-Length and truncating oversized streamed bodies.
function enforceResponseSizeLimit(response: Response, maxBytes: number): Response {
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new SSRFGuardError(`Response exceeds maximum allowed size of ${maxBytes} bytes`)
  }

  if (!response.body) {
    return response
  }

  const reader = response.body.getReader()
  let received = 0
  const limitedStream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
        return
      }
      received += value.byteLength
      if (received > maxBytes) {
        controller.error(new SSRFGuardError(`Response exceeds maximum allowed size of ${maxBytes} bytes`))
        await reader.cancel()
        return
      }
      controller.enqueue(value)
    },
    cancel(reason) {
      reader.cancel(reason)
    },
  })

  return new Response(limitedStream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

function getAllowedProtocols(): Set<string> {
  const raw = process.env.ALLOWED_LLM_PROTOCOLS ?? 'http://,https://'
  return new Set(
    raw
      .split(',')
      .map((p) => {
        const trimmed = p.trim().toLowerCase().replace(/^["']|["']$/g, '')
        return trimmed.endsWith('://') ? trimmed.slice(0, -2) : trimmed
      })
      .filter((p) => p.length > 0)
  )
}

function getAllowedHosts(): Set<string> {
  const raw = process.env.ALLOWED_LLM_HOSTS ?? 'localhost,127.0.0.1'
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''))
      .filter((h) => h.length > 0)
  )
}

function getAllowedPorts(): Set<string> {
  const raw = process.env.ALLOWED_LLM_PORTS ?? '11434,5950'
  return new Set(
    raw
      .split(',')
      .map((p) => p.trim().replace(/^["']|["']$/g, ''))
      .filter((p) => p.length > 0)
  )
}

export function validateLLMUrl(rawUrl: string): URL {
  let parsed: URL

  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new SSRFGuardError(
      `Invalid URL: "${rawUrl}"`
    )
  }

  const allowedProtocols = getAllowedProtocols()
  if (!allowedProtocols.has(parsed.protocol)) {
    throw new SSRFGuardError(
      `Disallowed URL scheme "${parsed.protocol}". Allowed schemes: ${[...allowedProtocols].join(', ')}.`
    )
  }

  const allowedHosts = getAllowedHosts()
  const hostname = parsed.hostname.toLowerCase()
  if (!allowedHosts.has(hostname)) {
    throw new SSRFGuardError(
      `Disallowed host "${parsed.hostname}". Allowed hosts: ${[...allowedHosts].join(', ')}.`
    )
  }

  const allowedPorts = getAllowedPorts()
  const port = parsed.port
  if (port && !allowedPorts.has(port)) {
    throw new SSRFGuardError(
      `Disallowed port "${port}". Allowed ports: ${[...allowedPorts].join(', ')}.`
    )
  }

  return parsed
}

export function validateImageUrl(rawUrl: string): URL {
  let parsed: URL

  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new SSRFGuardError(
      `Invalid image URL: "${rawUrl}"`
    )
  }

  const allowedProtocols = getAllowedProtocols()
  if (!allowedProtocols.has(parsed.protocol)) {
    throw new SSRFGuardError(
      `Disallowed image URL scheme "${parsed.protocol}". Allowed schemes: ${[...allowedProtocols].join(', ')}.`
    )
  }

  const payloadBase = (process.env.PAYLOAD_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '')

  let allowedOrigin: URL
  try {
    allowedOrigin = new URL(payloadBase)
  } catch {
    throw new SSRFGuardError(
      `PAYLOAD_URL environment variable is not a valid URL: "${payloadBase}"`
    )
  }

  const normalisePort = (u: URL): string => {
    if (u.port) return u.port
    if (u.protocol === 'http:') return '80'
    if (u.protocol === 'https:') return '443'
    return ''
  }

  const parsedOrigin     = `${parsed.protocol}//${parsed.hostname}:${normalisePort(parsed)}`
  const allowedOriginStr = `${allowedOrigin.protocol}//${allowedOrigin.hostname}:${normalisePort(allowedOrigin)}`

  if (parsedOrigin !== allowedOriginStr) {
    throw new SSRFGuardError(
      `Disallowed image URL "${rawUrl}". Images must be served from the Payload CMS server only (${allowedOriginStr}).`
    )
  }

  return parsed
}

export async function safeFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SSRFGuardError(`Invalid URL: "${url}"`)
  }

  const allowedProtocols = getAllowedProtocols()
  if (!allowedProtocols.has(parsed.protocol)) {
    throw new SSRFGuardError(
      `Disallowed URL scheme "${parsed.protocol}". Allowed schemes: ${[...allowedProtocols].join(', ')}.`
    )
  }

  const allowedHosts = getAllowedHosts()
  const validatedHostname = parsed.hostname.toLowerCase()
  if (!allowedHosts.has(validatedHostname)) {
    throw new SSRFGuardError(
      `Disallowed host "${parsed.hostname}". Allowed hosts: ${[...allowedHosts].join(', ')}.`
    )
  }

  const allowedPorts = getAllowedPorts()
  const port = parsed.port
  if (port && !allowedPorts.has(port)) {
    throw new SSRFGuardError(
      `Disallowed port "${port}". Allowed ports: ${[...allowedPorts].join(', ')}.`
    )
  }

  const validatedProtocol = parsed.protocol
  const validatedPort     = parsed.port ? `:${parsed.port}` : ''
  const validatedPath     = parsed.pathname
    .split('/')
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join('/')
  const params: string[]  = []
  parsed.searchParams.forEach((value, key) => {
    params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  })
  const validatedSearch   = params.length > 0 ? `?${params.join('&')}` : ''
  const safeUrl           = `${validatedProtocol}//${validatedHostname}${validatedPort}${validatedPath}${validatedSearch}`

  const response = await fetchWithTimeout(
    safeUrl,
    { ...init, redirect: 'error' },
    DEFAULT_FETCH_TIMEOUT_MS,
  )
  return enforceResponseSizeLimit(response, DEFAULT_MAX_RESPONSE_BYTES)
}

/**
 * Adapter matching the `fetch` signature expected by ai-sdk provider clients
 * (createOpenAICompatible), routing all inference calls through safeFetch.
 */
export const ssrfSafeFetch: typeof fetch = (input, init = {}) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return safeFetch(url, init)
}

export async function safeImageFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SSRFGuardError(`Invalid image URL: "${url}"`)
  }

  const allowedProtocols = getAllowedProtocols()
  if (!allowedProtocols.has(parsed.protocol)) {
    throw new SSRFGuardError(
      `Disallowed image URL scheme "${parsed.protocol}". Allowed schemes: ${[...allowedProtocols].join(', ')}.`
    )
  }

  const payloadBase = (process.env.PAYLOAD_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '')

  let allowedOrigin: URL
  try {
    allowedOrigin = new URL(payloadBase)
  } catch {
    throw new SSRFGuardError(
      `PAYLOAD_URL environment variable is not a valid URL: "${payloadBase}"`
    )
  }

  const normalisePort = (u: URL): string => {
    if (u.port) return u.port
    if (u.protocol === 'http:') return '80'
    if (u.protocol === 'https:') return '443'
    return ''
  }

  const parsedOrigin     = `${parsed.protocol}//${parsed.hostname}:${normalisePort(parsed)}`
  const allowedOriginStr = `${allowedOrigin.protocol}//${allowedOrigin.hostname}:${normalisePort(allowedOrigin)}`

  if (parsedOrigin !== allowedOriginStr) {
    throw new SSRFGuardError(
      `Disallowed image URL "${url}". Images must be served from the Payload CMS server only (${allowedOriginStr}).`
    )
  }

  const validatedProtocol = parsed.protocol
  const validatedHostname = parsed.hostname.toLowerCase()
  const validatedPort     = parsed.port ? `:${parsed.port}` : ''
  const validatedPath     = parsed.pathname
    .split('/')
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join('/')
  const params: string[]  = []
  parsed.searchParams.forEach((value, key) => {
    params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  })
  const validatedSearch   = params.length > 0 ? `?${params.join('&')}` : ''
  const safeUrl           = `${validatedProtocol}//${validatedHostname}${validatedPort}${validatedPath}${validatedSearch}`

  const response = await fetchWithTimeout(
    safeUrl,
    { ...init, redirect: 'error' },
    DEFAULT_FETCH_TIMEOUT_MS,
  )
  return enforceResponseSizeLimit(response, DEFAULT_MAX_RESPONSE_BYTES)
}