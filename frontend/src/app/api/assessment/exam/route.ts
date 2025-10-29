// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextResponse, type NextRequest } from 'next/server'
import { POST as baseAssessmentPOST } from '../route'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Force assessmentType to 'exam' for this route
    const payload = { ...body, assessmentType: 'exam' }

    const reassessmentUrl = new URL(req.nextUrl.toString())
    reassessmentUrl.pathname = '/api/assessment'

    const clonedHeaders = new Headers(req.headers)
    clonedHeaders.set('Content-Type', 'application/json')

    const assessmentRequest = new Request(reassessmentUrl.toString(), {
      method: 'POST',
      headers: clonedHeaders,
      body: JSON.stringify(payload),
    })

    return await baseAssessmentPOST(assessmentRequest)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Exam generation failed: ${message}` }, { status: 500 })
  }
}
