import type { SectionRenderer } from '../types'
import { addPageBreak, addSectionHeader, wrapText } from '../utils'
import { LABELS } from '../labels'
import { FONT_SIZES } from '../constants'

export const renderActivities: SectionRenderer = (ctx, content) => {
  if (!content.activities || content.activities.length === 0) return
  const { pdf, lang } = ctx

  addPageBreak(ctx)
  addSectionHeader(ctx, LABELS[lang].activities)

  content.activities.forEach((activity, i) => {
    if (i > 0) {
      addPageBreak(ctx)
      addSectionHeader(ctx, LABELS[lang].activities)
    }

    let activityHeight = 40
    const descLines = wrapText(ctx, activity.description, ctx.contentWidth - 20)
    activityHeight += descLines.length * 6

    let instructionsHeight = 0
    activity.instructions.forEach((ins) => {
      const lines = wrapText(ctx, ins, ctx.contentWidth - 30)
      instructionsHeight += lines.length * 6 + 2
    })
    activityHeight += 12 + instructionsHeight

    let materialsHeight = 0
    activity.materials.forEach((m) => {
      const lines = wrapText(ctx, m, ctx.contentWidth - 30)
      materialsHeight += lines.length * 6 + 2
    })
    activityHeight += 12 + materialsHeight

    // border
    pdf.setDrawColor(0, 153, 255)
    pdf.setLineWidth(1.5)
    pdf.line(ctx.margin, ctx.y, ctx.margin, ctx.y + activityHeight)
    pdf.setLineWidth(0.1)

    pdf.setFillColor(240, 248, 255)
    pdf.rect(ctx.margin + 1.5, ctx.y, ctx.contentWidth - 1.5, activityHeight, 'F')

    pdf.setFontSize(FONT_SIZES.title)
    pdf.setTextColor(94, 53, 177)
    pdf.setFont('DejaVuSans', 'bold')
    pdf.text(activity.title, ctx.margin + 10, ctx.y + 10)
    let y = ctx.y + 15

    pdf.setFontSize(FONT_SIZES.standard)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('DejaVuSans', 'normal')
    pdf.text(`${LABELS[lang].type}: ${activity.type}`, ctx.margin + 10, y)
    pdf.text(
      `${LABELS[lang].duration}: ${activity.duration}`,
      ctx.margin + ctx.contentWidth - 60,
      y,
    )
    y += 10

    pdf.text(descLines, ctx.margin + 10, y)
    y += descLines.length * 6 + 5

    pdf.setFontSize(FONT_SIZES.subtitle)
    pdf.setTextColor(94, 53, 177)
    pdf.setFont('DejaVuSans', 'bold')
    pdf.text(LABELS[lang].instructions, ctx.margin + 10, y)
    y += 8

    pdf.setFontSize(FONT_SIZES.standard)
    pdf.setFont('DejaVuSans', 'normal')
    activity.instructions.forEach((ins, idx) => {
      const lines = wrapText(ctx, ins, ctx.contentWidth - 30)
      pdf.text(`${idx + 1}.`, ctx.margin + 10, y)
      pdf.text(lines, ctx.margin + 20, y)
      y += lines.length * 6 + 2
    })

    pdf.setFontSize(FONT_SIZES.subtitle)
    pdf.setTextColor(94, 53, 177)
    pdf.setFont('DejaVuSans', 'bold')
    pdf.text(LABELS[lang].materialsNeeded, ctx.margin + 10, y + 6)
    y += 12

    pdf.setFontSize(FONT_SIZES.standard)
    pdf.setFont('DejaVuSans', 'normal')
    activity.materials.forEach((m) => {
      const lines = wrapText(ctx, m, ctx.contentWidth - 30)
      pdf.text('•', ctx.margin + 10, y)
      pdf.text(lines, ctx.margin + 15, y)
      y += lines.length * 6 + 2
    })

    ctx.y += activityHeight + 10
  })
}
