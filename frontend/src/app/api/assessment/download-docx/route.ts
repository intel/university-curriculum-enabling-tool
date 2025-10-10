// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextResponse, type NextRequest } from 'next/server'
import { normalizeLanguage, type Lang } from '@/lib/utils/lang'
import { generateAssessmentDocx } from '@/lib/assessment/docx/builder'

// Slim API route: validates body and delegates to modular DOCX generator.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { courseInfo, difficultyLevel, language } = body || {}
    const lang: Lang = normalizeLanguage(language)
    const { assessment, format, metadata } = courseInfo || {}
    if (!assessment) {
      return NextResponse.json({ error: 'No assessment data found in courseInfo' }, { status: 400 })
    }
    const buffer = await generateAssessmentDocx(
      {
        assessmentIdeas: [assessment],
        difficultyLevel,
        format: format === 'student' ? 'student' : 'lecturer',
        metadata: metadata || {
          courseCode: '',
          courseName: '',
          examTitle: assessment.type + ' Assessment',
        },
      },
      lang,
    )
    const sanitizedAssessmentType = assessment.type
      ? assessment.type.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      : 'assessment'
    const filename = `${sanitizedAssessmentType}_assessment_${format || 'lecturer'}.docx`
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { error: 'Failed to generate Word document: ' + message },
      { status: 500 },
    )
  }
}
