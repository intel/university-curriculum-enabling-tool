// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

// Get Ollama base URL from environment variables
function getOllamaBaseURL(): string {
  const ollamaUrl = process.env.PROVIDER_URL || 'http://localhost:5950'

  // Ensure the URL ends with /v1 for OpenAI compatibility
  if (ollamaUrl.endsWith('/v1')) {
    return ollamaUrl
  }

  return `${ollamaUrl}/v1`
}

// Ollama provider instance configured for OpenAI-compatible API
export const ollama = createOpenAICompatible({
  name: 'ollama',
  baseURL: getOllamaBaseURL(),
})
