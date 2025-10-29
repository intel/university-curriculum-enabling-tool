import { PdfContext } from '../../types'
import { FONT_SIZES } from '../../constants'

/**
 * Draws a rounded question container box (background + border) returning top-left Y start.
 */
export function drawQuestionContainer(
  ctx: PdfContext,
  height: number,
  options?: {
    inset?: number
    fill?: [number, number, number]
    border?: [number, number, number]
  },
) {
  const { pdf } = ctx
  const inset = options?.inset ?? 10
  const fill = options?.fill ?? [250, 250, 250]
  const border = options?.border ?? [220, 220, 220]
  pdf.setFillColor(...fill)
  pdf.setDrawColor(...border)
  pdf.roundedRect(ctx.margin + inset, ctx.y, ctx.contentWidth - inset * 2, height, 3, 3, 'FD')
}

/**
 * Draws a colored number circle for question index.
 */
export function drawQuestionNumber(
  ctx: PdfContext,
  qIndex: number,
  options?: {
    xOffset?: number
    yOffset?: number
    radius?: number
    color?: [number, number, number]
    textColor?: [number, number, number]
  },
) {
  const { pdf } = ctx
  const xOffset = options?.xOffset ?? 25
  const yOffset = options?.yOffset ?? 15
  const radius = options?.radius ?? 8
  const color = options?.color ?? [79, 70, 229] // default purple
  const textColor = options?.textColor ?? [255, 255, 255]
  pdf.setFillColor(...color)
  pdf.circle(ctx.margin + xOffset, ctx.y + yOffset, radius, 'F')
  pdf.setTextColor(...textColor)
  pdf.setFontSize(FONT_SIZES.small)
  pdf.setFont('DejaVuSans', 'bold')
  pdf.text(`${qIndex + 1}`, ctx.margin + xOffset, ctx.y + yOffset + 2, { align: 'center' })
}

/**
 * Draws a small section stripe header inside an existing card region.
 */
export function drawInlineStripeHeader(
  ctx: PdfContext,
  title: string,
  yOffset: number,
  options?: {
    stripeColor?: [number, number, number]
    textColor?: [number, number, number]
    widthInset?: number
  },
) {
  const { pdf } = ctx
  const stripeColor = options?.stripeColor ?? [230, 230, 250]
  const textColor = options?.textColor ?? [79, 70, 229]
  const widthInset = options?.widthInset ?? 5
  pdf.setFillColor(...stripeColor)
  pdf.roundedRect(
    ctx.margin + widthInset,
    ctx.y + yOffset,
    ctx.contentWidth - widthInset * 2,
    10,
    2,
    2,
    'F',
  )
  pdf.setFontSize(FONT_SIZES.subtitle)
  pdf.setTextColor(...textColor)
  pdf.setFont('DejaVuSans', 'bold')
  pdf.text(title, ctx.margin + ctx.contentWidth / 2, ctx.y + yOffset + 7, { align: 'center' })
}
