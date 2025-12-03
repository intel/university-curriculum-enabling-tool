// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

// Get OVMS base URL from environment variables
// - Chat Completions: /v3/chat/completions
// - Embeddings: /v3/embeddings
// - Models List: /v3/models
function getOVMSBaseURL(): string {
  const ovmsUrl = process.env.PROVIDER_URL || 'http://localhost:5950'

  // Ensure the URL ends with /v3 for OpenAI compatibility
  if (ovmsUrl.endsWith('/v3')) {
    return ovmsUrl
  }

  return `${ovmsUrl}/v3`
}

// OVMS provider instance configured for OpenAI-compatible API
export const ovms = createOpenAICompatible({
  name: 'ovms',
  baseURL: getOVMSBaseURL(),
  includeUsage: true,
  supportsStructuredOutputs: true,
})
