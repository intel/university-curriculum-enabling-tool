import type { SectionRenderer } from '../types'
import { addPageBreak, addSectionHeader, wrapText, ensureSpace } from '../utils'
import { LABELS } from '../labels'
import { FONT_SIZES } from '../constants'

export const renderSlides: SectionRenderer = (ctx, content) => {
  if (!content.slides || content.slides.length === 0) return
  const { pdf, lang } = ctx

  addPageBreak(ctx)
  addSectionHeader(ctx, LABELS[lang].slides)

  content.slides.forEach((slide, index) => {
    // measure required height for content + speaker notes
    const contentLines = slide.content
      .map((p) => wrapText(ctx, p, ctx.contentWidth - 25))
      .reduce((acc, lines) => acc + lines.length, 0)
    const slideContentHeight = contentLines * 6 + slide.content.length * 2 + 5

    const speakerNotesLines = wrapText(ctx, slide.notes, ctx.contentWidth - 16 - 16) // inside box
    const speakerNotesHeight = 6 + speakerNotesLines.length * 6 + 2
    const totalSlideHeight = 25 + slideContentHeight + speakerNotesHeight + 5

    ensureSpace(ctx, totalSlideHeight + 2, {
      beforeAdd: () => {},
      afterAdd: () => {
        // re-add section header on new page
        addSectionHeader(ctx, LABELS[lang].slides)
      },
    })

    // Left vertical purple line
    pdf.setDrawColor(94, 53, 177)
    pdf.setLineWidth(2)
    pdf.line(ctx.margin, ctx.y, ctx.margin, ctx.y + totalSlideHeight)
    pdf.setLineWidth(0.1)

    // slide background
    pdf.setFillColor(245, 247, 250)
    pdf.rect(ctx.margin + 2, ctx.y, ctx.contentWidth - 2, totalSlideHeight, 'F')

    // title & number
    pdf.setFontSize(FONT_SIZES.title)
    pdf.setTextColor(94, 53, 177)
    pdf.setFont('DejaVuSans', 'normal')
    pdf.text(`${index + 1}. ${slide.title}`, ctx.margin + 10, ctx.y + 15)
    let slideY = ctx.y + 30

    // bullet content
    pdf.setFontSize(FONT_SIZES.standard)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('DejaVuSans', 'normal')
    for (const point of slide.content) {
      const pointLines = wrapText(ctx, point, ctx.contentWidth - 25)
      pdf.text('•', ctx.margin + 10, slideY)
      pdf.text(pointLines, ctx.margin + 15, slideY)
      slideY += pointLines.length * 6 + 2
    }
    slideY += 3

    // speaker notes box
    const speakerNotesBoxWidth = ctx.contentWidth - 16
    pdf.setFillColor(240, 240, 240)
    pdf.rect(ctx.margin + 8, slideY, speakerNotesBoxWidth, speakerNotesHeight, 'F')

    pdf.setFontSize(FONT_SIZES.small)
    pdf.setFont('DejaVuSans', 'bold')
    pdf.setTextColor(80, 80, 80)
    pdf.text(LABELS[lang].speakerNotes, ctx.margin + 12, slideY + 8)

    pdf.setFont('DejaVuSans', 'normal')
    pdf.text(speakerNotesLines, ctx.margin + 12, slideY + 14)

    ctx.y += totalSlideHeight + 2
  })
}
