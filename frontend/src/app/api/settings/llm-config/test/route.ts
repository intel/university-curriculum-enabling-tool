// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/settings/llm-config/test
 * Test connection to the LLM server and auto-detect provider type
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { llmURL } = body

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

    // Validate URL format
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

    // Auto-detect provider type by testing endpoints sequentially
    const errors: string[] = []

    // Test 1: Try Ollama endpoint (/api/version)
    const ollamaEndpoint = `${trimmedURL}/api/version`
    const ollamaController = new AbortController()
    const ollamaTimeoutId = setTimeout(() => ollamaController.abort(), 5000)

    try {
      const ollamaResponse = await fetch(ollamaEndpoint, {
        method: 'GET',
        signal: ollamaController.signal,
      })
      clearTimeout(ollamaTimeoutId)

      if (ollamaResponse.ok) {
        return NextResponse.json({
          success: true,
          message: 'Connection successful - Ollama server detected',
          detectedType: 'ollama',
        })
      } else {
        errors.push(`Ollama test failed: Server returned status ${ollamaResponse.status}`)
      }
    } catch (ollamaError) {
      clearTimeout(ollamaTimeoutId)
      if (ollamaError instanceof Error && ollamaError.name === 'AbortError') {
        errors.push('Ollama test timeout')
      } else {
        errors.push('Ollama test failed to connect')
      }
    }

    // Test 2: Try OVMS endpoint (/v3/models)
    const ovmsURL = trimmedURL.endsWith('/v3') ? trimmedURL : `${trimmedURL}/v3`
    const ovmsEndpoint = `${ovmsURL}/models`
    const ovmsController = new AbortController()
    const ovmsTimeoutId = setTimeout(() => ovmsController.abort(), 5000)

    try {
      const ovmsResponse = await fetch(ovmsEndpoint, {
        method: 'GET',
        signal: ovmsController.signal,
      })
      clearTimeout(ovmsTimeoutId)

      if (ovmsResponse.ok) {
        return NextResponse.json({
          success: true,
          message: 'Connection successful - OVMS server detected',
          detectedType: 'ovms',
        })
      } else {
        errors.push(`OVMS test failed: Server returned status ${ovmsResponse.status}`)
      }
    } catch (ovmsError) {
      clearTimeout(ovmsTimeoutId)
      if (ovmsError instanceof Error && ovmsError.name === 'AbortError') {
        errors.push('OVMS test timeout')
      } else {
        errors.push('OVMS test failed to connect')
      }
    }

    // Both tests failed
    return NextResponse.json(
      {
        success: false,
        error: `Could not detect provider type. ${errors.join('. ')}`,
      },
      { status: 502 },
    )
  } catch (error) {
    console.error('Connection test failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Connection test failed',
      },
      { status: 500 },
    )
  }
}
