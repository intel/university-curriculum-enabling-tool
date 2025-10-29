import type { SectionRenderer } from '../types'
import { FONT_SIZES, LINE_HEIGHT } from '../constants'
import { wrapText } from '../utils'
import { LABELS } from '../labels'

export const renderTitleAndMetadata: SectionRenderer = (ctx, content) => {
  const { pdf, lang } = ctx
  // Title
  pdf.setFontSize(FONT_SIZES.title)
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('DejaVuSans', 'bold')
  const titleLines = wrapText(ctx, content.title)
  pdf.text(titleLines, ctx.margin, ctx.y)
  ctx.y += titleLines.length * (LINE_HEIGHT + 2)

  // Metadata
  pdf.setFontSize(FONT_SIZES.standard)
  pdf.setFont('DejaVuSans', 'normal')
  pdf.text(`${LABELS[lang].contentType}: ${content.contentType || 'Lecture'}`, ctx.margin, ctx.y)
  ctx.y += LINE_HEIGHT
  pdf.text(
    `${LABELS[lang].difficultyLevel}: ${content.difficultyLevel || 'Intermediate'}`,
    ctx.margin,
    ctx.y,
  )
  ctx.y += LINE_HEIGHT + 2

  // Introduction
  if (content.introduction?.trim()) {
    pdf.setFont('DejaVuSans', 'bold')
    pdf.text(LABELS[lang].introduction, ctx.margin, ctx.y)
    ctx.y += LINE_HEIGHT

    pdf.setFont('DejaVuSans', 'normal')
    const introLines = wrapText(ctx, content.introduction)
    pdf.text(introLines, ctx.margin, ctx.y)
    ctx.y += introLines.length * LINE_HEIGHT + 2
  }

  // Learning Outcomes
  pdf.setFont('DejaVuSans', 'bold')
  pdf.text(LABELS[lang].learningOutcomes, ctx.margin, ctx.y)
  ctx.y += LINE_HEIGHT
  pdf.setFont('DejaVuSans', 'normal')
  content.learningOutcomes.forEach((lo, i) => {
    const loLines = wrapText(ctx, `${i + 1}. ${lo}`)
    pdf.text(loLines, ctx.margin, ctx.y)
    ctx.y += loLines.length * LINE_HEIGHT
  })
  ctx.y += 4
}
