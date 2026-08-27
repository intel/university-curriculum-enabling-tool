// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { clearLLMUrlCache, getLLMConfig } from '@/lib/getLLMUrl'
import { validateLLMUrl, SSRFGuardError } from '@/lib/ssrf-guard'

/**
 * GET /api/settings/llm-config
 * Fetch current LLM configuration including provider type and URL
 */
export async function GET() {
  try {
    const payload = await getPayload({ config })
    const global = (await payload.findGlobal({
      slug: 'llm-config',
    })) as { providerType?: 'ollama' | 'ovms'; llmURL?: string }

    if (!global.providerType || !global.llmURL) {
      console.error('[/api/settings/llm-config] ERROR: Database NOT initialized!', {
        providerType: global.providerType,
        llmURL: global.llmURL,
        PROVIDER_ENV: process.env.PROVIDER,
      })
      return NextResponse.json(
        {
          success: false,
          error: `Database llm-config not initialized. providerType=${global.providerType}, llmURL=${global.llmURL}`,
        },
        { status: 500 },
      )
    }

    const providerType = global.providerType
    const llmURL = global.llmURL.trim()

    return NextResponse.json({
      success: true,
      data: {
        providerType,
        llmURL,
      },
    })
  } catch (error) {
    console.error('Failed to fetch LLM config:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch LLM configuration',
      },
      { status: 500 },
    )
  }
}

/**
 * POST /api/settings/llm-config
 * Update LLM configuration and invalidate cache
 * Body: { providerType: string, llmURL: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { providerType, llmURL } = body

    // Validate provider type
    if (!providerType || (providerType !== 'ollama' && providerType !== 'ovms')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid provider type. Must be "ollama" or "ovms"',
        },
        { status: 400 },
      )
    }

    if (!llmURL || typeof llmURL !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid URL provided',
        },
        { status: 400 },
      )
    }

    const trimmedURL = llmURL.trim()

    // Basic URL format check
    try {
      new URL(trimmedURL)
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid URL format',
        },
        { status: 400 },
      )
    }

    try {
      validateLLMUrl(trimmedURL)
    } catch (err) {
      if (err instanceof SSRFGuardError) {
        console.warn('[llm-config] Blocked disallowed URL:', trimmedURL, err.message)
        return NextResponse.json(
          {
            success: false,
            error: 'The provided URL is not permitted. Check ALLOWED_LLM_PROTOCOLS and ALLOWED_LLM_HOSTS configuration.',
            detail: err.message,
          },
          { status: 422 },
        )
      }
      throw err
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Update the global config in Payload CMS
    const payload = await getPayload({ config })
    await payload.updateGlobal({
      slug: 'llm-config',
      data: {
        llmURL: trimmedURL,
        ...(providerType && { providerType }),
      },
    })

    // Clear the cache to force fresh reads
    clearLLMUrlCache()

    // Get the fresh config to confirm update
    const updatedConfig = await getLLMConfig()

    return NextResponse.json({
      success: true,
      message: 'LLM configuration updated successfully',
      data: {
        providerType: updatedConfig.providerType,
        llmURL: updatedConfig.llmURL,
      },
    })
  } catch (error) {
    console.error('Failed to update LLM config:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update LLM configuration',
      },
      { status: 500 },
    )
  }
}