// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0


export class SSRFGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SSRFGuardError'
  }
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

  return fetch(safeUrl, {
    ...init,
    redirect: 'error',
  })
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

  return fetch(safeUrl, {
    ...init,
    redirect: 'error',
  })
}