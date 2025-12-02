// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextResponse, type NextRequest } from 'next/server'
import { POST as AssessmentPOST } from '../route'

// Force dynamic rendering to prevent caching issues
export const dynamic = 'force-dynamic'

// Set maximum duration to 10 minutes (600 seconds) to match assessment generation timeout
export const maxDuration = 600

export async function POST(req: NextRequest) {
  try {
    // Clone the request and modify the body to force assessmentType to 'project'
    const body = await req.json()
    const modifiedBody = { ...body, assessmentType: 'project' }

    // Create a new request with the modified body
    const modifiedReq = new Request(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(modifiedBody),
    })

    // Call the main assessment handler directly (no network overhead)
    console.log('Project route: Calling main assessment handler directly')
    return await AssessmentPOST(modifiedReq)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Project generation failed: ${message}` }, { status: 500 })
  }
}
