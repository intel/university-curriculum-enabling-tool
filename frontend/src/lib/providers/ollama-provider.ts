// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { ssrfSafeFetch } from '@/lib/ssrf-guard'

// Create an Ollama provider instance with a dynamic base URL
export function createOllamaProvider(baseURL: string) {
  const formattedURL = baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`

  const provider = createOpenAICompatible({
    name: 'ollama',
    baseURL: formattedURL,
    fetch: ssrfSafeFetch,
  })

  return { provider, baseURL: formattedURL }
}
