// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

/**
 * Provider Info API Endpoint
 *
 * This endpoint returns information about the currently configured AI provider.
 * Useful for debugging and verifying which provider is being used.
 */

import { NextResponse } from 'next/server'
import { getProviderInfo } from '@/lib/providers'
import { getLLMConfig } from '@/lib/getLLMUrl'

export async function GET() {
  try {
    const { providerName, baseURL } = await getProviderInfo()
    const config = await getLLMConfig()

    return NextResponse.json({
      success: true,
      provider: {
        providerName, // 'ollama' or 'ovms' from database
        baseURL,
        configured: {
          PROVIDER_ENV: process.env.PROVIDER || '(not set)',
          providerType: config.providerType,
          llmURL: config.llmURL,
        },
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
