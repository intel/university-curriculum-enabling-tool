import type { SectionRenderer } from '../types'
import { addPageBreak, addSectionHeader, wrapText, ensureSpace } from '../utils'
import { LABELS } from '../labels'
import { LINE_HEIGHT } from '../constants'

export const renderKeyTerms: SectionRenderer = (ctx, content) => {
  if (!content.keyTerms || content.keyTerms.length === 0) return
  const { pdf, lang } = ctx

  addPageBreak(ctx)
  addSectionHeader(ctx, LABELS[lang].keyTerms)

  for (const term of content.keyTerms) {
    // estimate space
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    const definitionLines = wrapText(ctx, term.definition, ctx.contentWidth - 10)
    const needed = LINE_HEIGHT + definitionLines.length * 5 + 9
    ensureSpace(ctx, needed)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(0, 0, 0)
    pdf.text(term.term, ctx.margin, ctx.y)
    ctx.y += 6

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(definitionLines, ctx.margin + 10, ctx.y)
    ctx.y += definitionLines.length * 5 + 7
  }
}
