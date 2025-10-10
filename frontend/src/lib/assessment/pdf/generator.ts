// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import jsPDF from 'jspdf'
import type { PdfGenerationOptions, PdfContext } from './types'
import { PDF_DIMENSIONS, CONTENT_WIDTH } from './utils/constants'
import { localizeTitle } from './utils/labels'
import { addHeader, addFooter, addTitleSection } from './components/header'
import { generateProjectAssessment } from './generators/projectAssessment'
import { generateRegularAssessment } from './generators/regularAssessment'

/**
 * Main PDF generator orchestrator
 */
export async function generateAssessmentPDF(options: PdfGenerationOptions): Promise<Buffer> {
  const { assessment, format, metadata, language } = options

  // Create PDF instance
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  pdf.setFont('helvetica')

  // Create context
  const ctx: PdfContext = {
    pdf,
    pageWidth: PDF_DIMENSIONS.pageWidth,
    pageHeight: PDF_DIMENSIONS.pageHeight,
    margin: PDF_DIMENSIONS.margin,
    contentWidth: CONTENT_WIDTH,
    language,
    format: format as 'student' | 'lecturer',
    currentY: PDF_DIMENSIONS.margin,
  }

  // Add header to first page
  addHeader(ctx)

  // Add title section
  const safeMetadata = metadata || {
    courseCode: '',
    courseName: '',
    examTitle: assessment.type + ' Assessment',
  }
  const rawTitle = safeMetadata.examTitle || `${assessment.type} Assessment`
  const title = localizeTitle(rawTitle, language)
  const courseInfo = `${safeMetadata.courseCode || ''} – ${safeMetadata.courseName || ''}`

  ctx.currentY = addTitleSection(ctx, title, courseInfo)

  // Determine assessment type and generate accordingly
  const isProjectType = /\b(project|proyek)\b/i.test(assessment.type || '')

  if (isProjectType) {
    ctx.currentY = generateProjectAssessment(ctx, assessment, safeMetadata)
  } else {
    ctx.currentY = generateRegularAssessment(ctx, assessment, safeMetadata)
  }

  // Add footers to all pages
  const totalPages = pdf.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i)
    addFooter(ctx, i, totalPages)
  }

  // Convert to buffer
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
  return pdfBuffer
}
