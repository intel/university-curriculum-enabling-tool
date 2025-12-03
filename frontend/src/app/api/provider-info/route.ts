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

export async function GET() {
  try {
    const info = getProviderInfo()

    return NextResponse.json({
      success: true,
      provider: {
        service: info.service,
        baseURL: info.baseURL,
        configured: {
          PROVIDER: process.env.PROVIDER || '(not set, defaulting to ollama)',
          PROVIDER_URL: process.env.PROVIDER_URL || 'http://localhost:5950',
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
