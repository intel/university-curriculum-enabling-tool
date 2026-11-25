// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SSRFGuardError,
  UnauthorizedRequestError,
  assertSameOriginRequest,
  safeFetch,
  validateLLMUrl,
} from './ssrf-guard'

const ENV_KEYS = [
  'ALLOWED_LLM_PROTOCOLS',
  'ALLOWED_LLM_HOSTS',
  'ALLOWED_LLM_PORTS',
  'LLM_FETCH_TIMEOUT_MS',
  'LLM_MAX_RESPONSE_BYTES',
] as const

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  vi.unstubAllGlobals()
})

describe('validateLLMUrl', () => {
  it('accepts the default allowed localhost/port combination', () => {
    expect(() => validateLLMUrl('http://localhost:5950')).not.toThrow()
    expect(() => validateLLMUrl('http://127.0.0.1:11434')).not.toThrow()
  })

  it('rejects malformed URLs', () => {
    expect(() => validateLLMUrl('not a url')).toThrow(SSRFGuardError)
  })

  it('rejects non-HTTP(S) schemes', () => {
    expect(() => validateLLMUrl('file:///etc/passwd')).toThrow(SSRFGuardError)
    expect(() => validateLLMUrl('ftp://127.0.0.1:5950')).toThrow(SSRFGuardError)
    expect(() => validateLLMUrl('gopher://127.0.0.1:5950')).toThrow(SSRFGuardError)
  })

  it('rejects private-range hosts not on the allowlist', () => {
    expect(() => validateLLMUrl('http://10.0.0.5:5950')).toThrow(SSRFGuardError)
    expect(() => validateLLMUrl('http://192.168.1.1:5950')).toThrow(SSRFGuardError)
    expect(() => validateLLMUrl('http://172.16.0.1:5950')).toThrow(SSRFGuardError)
  })

  it('rejects the cloud metadata address', () => {
    expect(() => validateLLMUrl('http://169.254.169.254:5950')).toThrow(SSRFGuardError)
  })

  it('rejects alternate IP-format bypass attempts targeting non-allowed hosts', () => {
    // Decimal/hex/octal forms of 169.254.169.254 (metadata) all normalise away from the allowlist.
    expect(() => validateLLMUrl('http://2852039166:5950')).toThrow(SSRFGuardError)
    expect(() => validateLLMUrl('http://0xA9FEA9FE:5950')).toThrow(SSRFGuardError)
  })

  it('normalises alternate IP-format loopback addresses to the allowed literal', () => {
    // These all resolve to 127.0.0.1 per the WHATWG URL spec, so they are allowed just like 127.0.0.1 is.
    expect(() => validateLLMUrl('http://0x7f000001:5950')).not.toThrow()
    expect(() => validateLLMUrl('http://2130706433:5950')).not.toThrow()
  })

  it('rejects IPv6 loopback since it is not on the default allowlist', () => {
    expect(() => validateLLMUrl('http://[::1]:5950')).toThrow(SSRFGuardError)
  })

  it('rejects ports outside the allowlist', () => {
    expect(() => validateLLMUrl('http://127.0.0.1:9999')).toThrow(SSRFGuardError)
  })

  it('honours custom allowlists from environment variables', () => {
    process.env.ALLOWED_LLM_HOSTS = 'my-llm-host'
    process.env.ALLOWED_LLM_PORTS = '4242'
    expect(() => validateLLMUrl('http://my-llm-host:4242')).not.toThrow()
    expect(() => validateLLMUrl('http://localhost:5950')).toThrow(SSRFGuardError)
  })
})

describe('safeFetch', () => {
  it('never issues a network request for a disallowed host', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(safeFetch('http://evil.example.com:5950/v1')).rejects.toThrow(SSRFGuardError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forces redirect: "error" so redirects/DNS rebinding cannot be followed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await safeFetch('http://localhost:5950/v1/models')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('http://localhost:5950/v1/models')
    expect(calledInit.redirect).toBe('error')
  })

  it('rejects responses whose Content-Length exceeds the configured cap', async () => {
    // Bounds are read from env once at module load, so exercise the default 50MB cap directly.
    const oversizedBytes = 50 * 1024 * 1024 + 1
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-length': String(oversizedBytes) },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(safeFetch('http://localhost:5950/v1/models')).rejects.toThrow(SSRFGuardError)
  })
})

describe('assertSameOriginRequest', () => {
  const makeRequest = (url: string, headers: Record<string, string>) =>
    ({ url, headers: new Headers(headers) }) as Pick<Request, 'url' | 'headers'>

  it('allows requests whose Origin header matches the request origin', () => {
    const request = makeRequest('http://127.0.0.1:8080/api/settings/llm-config', {
      origin: 'http://127.0.0.1:8080',
    })
    expect(() => assertSameOriginRequest(request)).not.toThrow()
  })

  it('allows requests with a matching Referer when Origin is absent', () => {
    const request = makeRequest('http://127.0.0.1:8080/api/settings/llm-config', {
      referer: 'http://127.0.0.1:8080/workspace/settings',
    })
    expect(() => assertSameOriginRequest(request)).not.toThrow()
  })

  it('rejects cross-origin Origin headers (CSRF-style calls)', () => {
    const request = makeRequest('http://127.0.0.1:8080/api/settings/llm-config', {
      origin: 'https://attacker.example.com',
    })
    expect(() => assertSameOriginRequest(request)).toThrow(UnauthorizedRequestError)
  })

  it('rejects requests without any Origin or Referer header', () => {
    const request = makeRequest('http://127.0.0.1:8080/api/settings/llm-config', {})
    expect(() => assertSameOriginRequest(request)).toThrow(UnauthorizedRequestError)
  })
})
