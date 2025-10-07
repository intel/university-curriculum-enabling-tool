// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextResponse, type NextRequest } from 'next/server'
import { normalizeLanguage, type Lang } from '@/lib/utils/lang'
import { generateAssessmentPDF, type PdfGenerationOptions } from '@/lib/assessment/pdf'

export async function POST(request: NextRequest) {
  try {
    // Parse the incoming request body
    const { assessmentType, difficultyLevel, courseInfo, language } = await request.json()

    // Validate and normalize the language parameter
    const lang: Lang = normalizeLanguage(language)

    // Extract data from courseInfo
    const { assessment, format, metadata } = courseInfo || {}

    // Log the parsed data for debugging
    console.log('Parsed request data:', {
      assessmentType,
      difficultyLevel,
      assessment,
      format,
      metadata,
    })

    console.log(`Generating PDF for assessment (${format} format):`, assessment.type)

    // Generate the PDF file using the modular system
    const options: PdfGenerationOptions = {
      assessment,
      assessmentType,
      difficultyLevel,
      format: format || 'lecturer',
      metadata: metadata || {
        courseCode: '',
        courseName: '',
        examTitle: assessment.type + ' Assessment',
      },
      language: lang,
    }

    const pdfBuffer = await generateAssessmentPDF(options)

    if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
      console.error('Invalid PDF buffer returned:', typeof pdfBuffer)
      return NextResponse.json({ error: 'Failed to generate valid PDF file' }, { status: 500 })
    }

    console.log('PDF generated successfully, buffer size:', pdfBuffer.length)

    // Create response with appropriate headers for PDF download
    const response = new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${assessment.type}-assessment.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })

    return response
  } catch (error) {
    console.error('Error in PDF generation endpoint:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { error: 'Failed to generate PDF document: ' + errorMessage },
      { status: 500 },
    )
  }
}
