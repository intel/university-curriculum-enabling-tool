// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

// Create an OVMS provider instance with a dynamic base URL
// OVMS OpenAI-compatible endpoints:
// - Chat Completions: /v3/chat/completions
// - Embeddings: /v3/embeddings
// - Models List: /v3/models
export function createOVMSProvider(baseURL: string) {
  // Ensure the URL ends with /v3 for OpenAI compatibility
  const formattedURL = baseURL.endsWith('/v3') ? baseURL : `${baseURL}/v3`

  const provider = createOpenAICompatible({
    name: 'ovms',
    baseURL: formattedURL,
    includeUsage: true,
    supportsStructuredOutputs: true,
  })

  return { provider, baseURL: formattedURL }
}
