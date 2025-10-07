import type { SectionRenderer } from '../types'
import { addPageBreak, addSectionHeader, wrapText, ensureSpace } from '../utils'
import { LABELS } from '../labels'

export const renderFurtherReadings: SectionRenderer = (ctx, content) => {
  if (!content.furtherReadings || content.furtherReadings.length === 0) return
  const { pdf, lang } = ctx

  addPageBreak(ctx)
  addSectionHeader(ctx, LABELS[lang].furtherReadings)

  for (const reading of content.furtherReadings) {
    const descLines = wrapText(ctx, reading.readingDescription, ctx.contentWidth - 10)
    const needed = 7 + 8 + descLines.length * 6 + 10
    ensureSpace(ctx, needed)

    pdf.setFontSize(11)
    pdf.setTextColor(0, 0, 0)
    pdf.text('•', ctx.margin, ctx.y)
    pdf.setFont('helvetica', 'bold')
    pdf.text(reading.title, ctx.margin + 5, ctx.y)
    ctx.y += 7

    pdf.setFont('helvetica', 'normal')
    pdf.text(`${LABELS[lang].author} ${reading.author}`, ctx.margin + 5, ctx.y)
    ctx.y += 8

    pdf.text(descLines, ctx.margin + 5, ctx.y)
    ctx.y += descLines.length * 6 + 10
  }
}
