// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextResponse, type NextRequest } from 'next/server'

import { POST as handleAssessmentPost } from '../route'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Force assessmentType to 'project' for this route
    const payload = { ...body, assessmentType: 'project' }

    const headers = new Headers(req.headers)
    headers.set('Content-Type', 'application/json')

    const proxyRequest = new Request(new URL('/api/assessment', req.url).href, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    return await handleAssessmentPost(proxyRequest)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Project generation failed: ${message}` }, { status: 500 })
  }
}
