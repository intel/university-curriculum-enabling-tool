import { LABELS } from '../../labels'
import { FONT_SIZES } from '../../constants'
import type { PdfContext } from '../../types'
import { ensureSpace, wrapText } from '../../utils'

export interface CriteriaItem {
  name?: string
  weight?: number
  description?: string
}

export function renderAssessmentCriteria(
  ctx: PdfContext,
  criteria: CriteriaItem[] | undefined,
  opts?: { headingColor?: [number, number, number]; stripeColor?: [number, number, number] },
) {
  if (!criteria || criteria.length === 0) return
  const { pdf, lang } = ctx
  const headingColor = opts?.headingColor || [0, 100, 150]
  const stripeColor = opts?.stripeColor || [230, 245, 255]

  // Estimate height
  let totalHeight = 20 // header block + spacing
  const lineHeights: number[] = []
  criteria.forEach((c) => {
    const title = [c.name, c.weight != null ? `(${c.weight}%)` : ''].filter(Boolean).join(' ')
    const titleLines = wrapText(ctx, title, ctx.contentWidth - 50)
    let h = Math.max(titleLines.length * 6, 10) + 4
    if (c.description) {
      const descLines = wrapText(ctx, c.description, ctx.contentWidth - 60)
      h += descLines.length * 6 + 2
    }
    lineHeights.push(h)
    totalHeight += h
  })
  ensureSpace(ctx, totalHeight + 10)

  // Header stripe
  pdf.setFillColor(stripeColor[0], stripeColor[1], stripeColor[2])
  pdf.roundedRect(ctx.margin, ctx.y, ctx.contentWidth, 10, 2, 2, 'F')
  pdf.setFontSize(FONT_SIZES.subtitle)
  pdf.setTextColor(headingColor[0], headingColor[1], headingColor[2])
  pdf.setFont('DejaVuSans', 'bold')
  pdf.text(LABELS[lang].assessmentCriteria, ctx.margin + ctx.contentWidth / 2, ctx.y + 7, {
    align: 'center',
  })
  ctx.y += 15

  // Criteria items
  criteria.forEach((c, idx) => {
    const title = [c.name, c.weight != null ? `(${c.weight}%)` : ''].filter(Boolean).join(' ')
    const titleLines = wrapText(ctx, title, ctx.contentWidth - 50)
    pdf.setTextColor(0, 0, 0)
    pdf.setFontSize(FONT_SIZES.standard)
    pdf.setFont('DejaVuSans', 'bold')
    pdf.text(titleLines, ctx.margin + 10, ctx.y)
    ctx.y += Math.max(titleLines.length * 6, 10) + 2

    if (c.description) {
      pdf.setFont('DejaVuSans', 'normal')
      const descLines = wrapText(ctx, c.description, ctx.contentWidth - 60)
      pdf.text(descLines, ctx.margin + 20, ctx.y)
      ctx.y += descLines.length * 6 + 2
    }

    ctx.y += 4
    if (idx === criteria.length - 1) ctx.y += 4
  })
}
