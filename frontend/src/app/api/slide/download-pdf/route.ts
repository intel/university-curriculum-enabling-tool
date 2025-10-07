// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextResponse, type NextRequest } from 'next/server'
import type { LectureContent } from '../types'
import { generateLecturePdf } from '@/lib/pdf/generateLecturePdf'

// Thin API wrapper – all PDF composition handled in lib/pdf modules
export async function POST(request: NextRequest) {
  try {
    const { content, language } = await request.json()
    if (!content || !content.title || !content.slides) {
      return NextResponse.json({ error: 'Invalid content structure' }, { status: 400 })
    }
    const lang = language === 'id' ? 'id' : 'en'
    const pdfBuffer = await generateLecturePdf(content as LectureContent, lang)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(
          content.title.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
        )}.pdf"`,
      },
    })
  } catch (err) {
    console.error('Error generating PDF:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
