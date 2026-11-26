// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

export class RequestTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RequestTooLargeError'
  }
}

// Caps JSON request bodies before parsing to prevent oversized-payload document/archive
// generation (T11): enforced on the raw byte stream, not just the Content-Length header,
// so chunked requests without that header are bounded too.
const DEFAULT_MAX_REQUEST_BODY_BYTES =
  Number(process.env.MAX_REQUEST_BODY_BYTES) || 50 * 1024 * 1024

export async function readJsonWithLimit<T = unknown>(
  request: Pick<Request, 'headers' | 'body' | 'json'>,
  maxBytes: number = DEFAULT_MAX_REQUEST_BODY_BYTES,
): Promise<T> {
  const contentLength = request.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new RequestTooLargeError(
      `Request body exceeds the maximum allowed size of ${maxBytes} bytes.`,
    )
  }

  if (!request.body) {
    return (await request.json()) as T
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel()
      throw new RequestTooLargeError(
        `Request body exceeds the maximum allowed size of ${maxBytes} bytes.`,
      )
    }
    chunks.push(value)
  }

  const combined = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  return JSON.parse(new TextDecoder().decode(combined)) as T
}
