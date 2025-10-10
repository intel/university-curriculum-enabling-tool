// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

export function extractTextFromMessage(msg: unknown): string {
  if (!msg) return ''

  const m = msg as Record<string, unknown>

  // Handle 'parts' structure first
  if (Array.isArray(m.parts)) {
    const textParts = m.parts
      .map((p) => {
        if (!p) return ''
        if (typeof p === 'string') return p
        if (typeof p === 'object' && p !== null) {
          const obj = p as Record<string, unknown>
          if (obj.type === 'text' && typeof obj.text === 'string') {
            return obj.text
          }
          // Fallback for other text fields
          if (typeof obj.text === 'string') return obj.text
          if (typeof obj.body === 'string') return obj.body
          if (typeof obj.content === 'string') return obj.content
          const content = obj.content as Record<string, unknown> | undefined
          if (content && typeof content === 'object') {
            if (typeof content.text === 'string') return content.text
            if (typeof content.body === 'string') return content.body
          }
        }
        return ''
      })
      .filter(Boolean) as string[]

    return textParts.join('\n\n')
  }

  if (typeof m.content === 'string') {
    return m.content
  }

  return ''
}
