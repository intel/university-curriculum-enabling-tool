// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { PdfContext } from '../types'

/**
 * Clean model answer if it's in JSON format
 */
export function cleanModelAnswer(answer: string | undefined): string {
  if (!answer) return ''

  // Check if the answer looks like JSON
  if (
    (answer.trim().startsWith('{') && answer.trim().endsWith('}')) ||
    answer.includes('"modelAnswer"')
  ) {
    try {
      // Try to parse it as JSON
      const parsed = JSON.parse(answer)
      if (parsed.modelAnswer) {
        return parsed.modelAnswer
      }
    } catch {
      // If parsing fails, try to extract with regex
      const match = answer.match(/"modelAnswer"\s*:\s*"([\s\S]*?)"/)
      if (match && match[1]) {
        return match[1].replace(/\\"/g, '"')
      }
    }
  }

  return answer
}

/**
 * Render formatted text with bold segments (marked by **)
 */
export function renderFormattedText(
  ctx: PdfContext,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number = 6,
): number {
  const { pdf } = ctx
  let currentY = y
  let currentX = x

  const sections = text.split('\n')

  for (const rawSection of sections) {
    let rawLine = rawSection
    let indentOffset = 0

    // Handle bullet points
    const bulletMatch = rawLine.match(/^(\s*)(([*\-+])|(\d+\.))\s+(.*)/)
    if (bulletMatch) {
      const indentStr = bulletMatch[1]

      // Calculate indentation width
      let spaceCount = 0
      for (const char of indentStr) {
        spaceCount += char === '\t' ? 4 : 1
      }

      const indentLevel = Math.floor(spaceCount / 4)
      indentOffset = indentLevel * 10

      // Detect bullet type
      const unorderedBullet = bulletMatch[3]
      const numberedBullet = bulletMatch[4]
      const bulletText = bulletMatch[5]

      const bulletSymbol = unorderedBullet ? '• ' : numberedBullet + ' '
      rawLine = bulletSymbol + bulletText
    }

    // Process text with bold segments
    currentX = x + indentOffset
    const parts = rawLine.split('**')

    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i]
      if (!chunk) continue

      const fontStyle = i % 2 === 0 ? 'normal' : 'bold'
      pdf.setFont('DejaVuSans', fontStyle)

      let remainingText = chunk

      while (remainingText.length > 0) {
        const availableWidth = maxWidth - (currentX - x)
        const [linePart] = pdf.splitTextToSize(remainingText, availableWidth)

        // Check if we need a new page
        if (currentY + lineHeight > ctx.pageHeight - ctx.margin) {
          pdf.addPage()
          currentY = ctx.margin
          // Re-add header if needed
        }

        // Render line
        pdf.text(linePart, currentX, currentY)

        remainingText = remainingText.slice(linePart.length).trim()

        if (remainingText.length > 0) {
          currentY += lineHeight
          currentX = x + indentOffset // maintain indent for wrapped lines
        } else {
          currentX += pdf.getTextWidth(linePart)
        }
      }
    }

    currentY += lineHeight
    currentX = x // Reset x for next line
  }

  return currentY
}
