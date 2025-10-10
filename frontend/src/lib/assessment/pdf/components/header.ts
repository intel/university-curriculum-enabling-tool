// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { PdfContext } from '../types'
import { FONT_SIZES } from '../utils/constants'
import { getPdfLabels } from '../utils/labels'

/**
 * Adds header to the current page
 */
export function addHeader(ctx: PdfContext): void {
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  ctx.pdf.setTextColor(0, 0, 0)
  // Removed SULIT/CONFIDENTIAL header marking per requirements
}

/**
 * Adds footer with page numbers to the current page
 */
export function addFooter(ctx: PdfContext, pageNum: number, totalPages: number): void {
  const labels = getPdfLabels(ctx.language)
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  ctx.pdf.setTextColor(0, 0, 0)
  // Removed SULIT/CONFIDENTIAL footer markings; keep page numbers
  ctx.pdf.text(
    `${labels.pageLabel} ${pageNum} ${labels.ofLabel} ${totalPages}`,
    ctx.pageWidth - ctx.margin - 30,
    ctx.pageHeight - 10,
  )
}

/**
 * Adds title section with course information
 */
export function addTitleSection(ctx: PdfContext, title: string, courseInfo: string): number {
  // Title
  ctx.pdf.setFontSize(FONT_SIZES.title)
  ctx.pdf.setFont('helvetica', 'bold')
  ctx.pdf.text(title, ctx.pageWidth / 2, ctx.currentY, {
    align: 'center',
  })

  // Course information
  ctx.pdf.setFontSize(FONT_SIZES.subtitle)
  ctx.pdf.setFont('helvetica', 'bold')
  ctx.pdf.text(courseInfo, ctx.pageWidth / 2, ctx.currentY + 10, {
    align: 'center',
  })

  return ctx.currentY + 20
}
