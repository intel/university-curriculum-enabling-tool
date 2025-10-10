// Shared PDF utility helpers extracted from monolithic route
// Focus: pagination, footer, section headers, text wrapping & space management
import jsPDF from 'jspdf'
import { PAGE, FONT_SIZES, COLORS, LINE_HEIGHT } from './constants'
import { PdfContext, SpaceCheckOptions } from './types'
import { LABELS } from './labels'

export function createPdfContext(lang: PdfContext['lang']): PdfContext {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.setFont('helvetica')
  return {
    pdf,
    lang,
    y: PAGE.margin,
    pageWidth: PAGE.width,
    pageHeight: PAGE.height,
    margin: PAGE.margin,
    contentWidth: PAGE.width - PAGE.margin * 2,
  }
}

export function addFooter(ctx: PdfContext) {
  const { pdf, pageWidth, pageHeight, lang } = ctx
  pdf.setFontSize(FONT_SIZES.footer)
  pdf.setTextColor(...COLORS.footer)
  pdf.setFont('helvetica', 'normal')
  pdf.text(
    `${LABELS[lang].generatedOn} ${new Date().toLocaleDateString()}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' },
  )
}

export function addPageBreak(ctx: PdfContext) {
  ctx.pdf.addPage()
  ctx.y = ctx.margin
  addFooter(ctx) // provisional footer (will be overwritten in full pass)
}

export function addSectionHeader(ctx: PdfContext, title: string) {
  const { pdf, margin, pageWidth } = ctx
  pdf.setFontSize(FONT_SIZES.sectionTitle)
  pdf.setTextColor(...COLORS.purple)
  pdf.setFont('helvetica', 'bold')
  pdf.text(title, margin, ctx.y)
  ctx.y += 5
  pdf.setDrawColor(...COLORS.gray)
  pdf.line(margin, ctx.y, pageWidth - margin, ctx.y)
  ctx.y += 10
}

export function ensureSpace(ctx: PdfContext, needed: number, opts: SpaceCheckOptions = {}) {
  const available = ctx.pageHeight - ctx.margin - ctx.y
  if (available < needed) {
    opts.beforeAdd?.()
    addPageBreak(ctx)
    opts.afterAdd?.()
  }
}

export function wrapText(ctx: PdfContext, text: string, width?: number) {
  return ctx.pdf.splitTextToSize(text, width ?? ctx.contentWidth)
}

export function drawBulletedLines(
  ctx: PdfContext,
  lines: string[],
  bulletIndent = 5,
  lineGap = LINE_HEIGHT,
) {
  const { pdf, margin } = ctx
  for (const block of lines) {
    const wrapped = wrapText(ctx, block, ctx.contentWidth - bulletIndent - 5)
    pdf.text('•', margin, ctx.y)
    pdf.text(wrapped, margin + bulletIndent, ctx.y)
    ctx.y += wrapped.length * lineGap + 2
  }
}

export function applyFootersToAllPages(ctx: PdfContext) {
  const total = ctx.pdf.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    ctx.pdf.setPage(i)
    addFooter(ctx)
  }
}
