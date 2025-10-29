// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextResponse, type NextRequest } from 'next/server'
import jsPDF from 'jspdf'
import '@/lib/fonts/DejaVuSans'
import '@/lib/fonts/DejaVuSans-Bold'

// Helper to fetch image and convert to base64
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    let imageUrl = url
    if (url.startsWith('/')) {
      const base = process.env.PAYLOAD_URL?.replace(/\/$/, '') || ''
      imageUrl = url.replace(/^\/api/, '')
      imageUrl = base + imageUrl
    }
    const res = await fetch(new URL(imageUrl))
    const buffer = await res.arrayBuffer()
    const mime = imageUrl.match(/\.(jpe?g)$/i)
      ? 'image/jpeg'
      : imageUrl.match(/\.svg$/i)
        ? 'image/svg+xml'
        : imageUrl.match(/\.gif$/i)
          ? 'image/gif'
          : 'image/png'
    const base64 = Buffer.from(buffer).toString('base64')
    return `data:${mime};base64,${base64}`
  } catch (e) {
    console.error('Failed to fetch image for PDF:', url, e)
    return null
  }
}

// Helper to render inline markdown (bold, code, links)
function renderInlineMarkdown(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  isBold = false,
) {
  let cursor = 0
  let match
  const regex = /(\*\*(.*?)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\([^)]+\))/g
  pdf.setFont('DejaVuSans', isBold ? 'bold' : 'normal')
  pdf.setFontSize(fontSize)
  let currentX = x

  while ((match = regex.exec(text))) {
    if (match.index > cursor) {
      const normalText = text.slice(cursor, match.index)
      pdf.setFont('DejaVuSans', isBold ? 'bold' : 'normal')
      pdf.text(normalText, currentX, y, { baseline: 'top' })
      currentX += pdf.getTextWidth(normalText)
    }
    if (match[1]) {
      // Render bold text
      pdf.setFont('DejaVuSans', 'bold')
      pdf.text(match[2], currentX, y, { baseline: 'top' })
      currentX += pdf.getTextWidth(match[2])
    } else if (match[3]) {
      // Render inline code using monospace font
      pdf.setFont('courier', 'normal')
      pdf.text(match[4], currentX, y, { baseline: 'top' })
      currentX += pdf.getTextWidth(match[4])
    } else if (match[5]) {
      // Render link text as normal text
      pdf.setFont('DejaVuSans', isBold ? 'bold' : 'normal')
      pdf.text(match[6], currentX, y, { baseline: 'top' })
      currentX += pdf.getTextWidth(match[6])
    }
    cursor = regex.lastIndex
  }
  if (cursor < text.length) {
    pdf.setFont('DejaVuSans', isBold ? 'bold' : 'normal')
    pdf.text(text.slice(cursor), currentX, y, { baseline: 'top' })
  }
}

async function generatePDF(content: string): Promise<Buffer> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  let customFontsAvailable = true
  const originalSetFont = pdf.setFont.bind(pdf)

  try {
    originalSetFont('DejaVuSans', 'normal')
    console.log('Custom fonts loaded successfully')
  } catch (error) {
    customFontsAvailable = false
    console.error('Error setting custom fonts:', error)
    originalSetFont('helvetica', 'normal')
  }

  const setFontStyle = (style: 'normal' | 'bold') => {
    if (customFontsAvailable) {
      try {
        if (style === 'bold') {
          originalSetFont('DejaVuSans-Bold', 'normal')
        } else {
          originalSetFont('DejaVuSans', 'normal')
        }
        return
      } catch (fontError) {
        customFontsAvailable = false
        console.error('Error setting custom fonts:', fontError)
      }
    }
    originalSetFont('helvetica', style)
  }

  pdf.setFont = function (fontName: string, fontStyle?: string, fontWeight?: string) {
    if (fontName === 'DejaVuSans' || fontName === 'DejaVuSans-Bold') {
      setFontStyle(fontStyle === 'bold' || fontName === 'DejaVuSans-Bold' ? 'bold' : 'normal')
      return this
    }
    try {
      return originalSetFont(fontName, fontStyle, fontWeight)
    } catch (fallbackError) {
      console.error('Error setting font, falling back to Helvetica:', fallbackError)
      return originalSetFont('helvetica', fontStyle, fontWeight)
    }
  }

  const pageWidth = 210
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = margin

  pdf.setFontSize(12)
  pdf.setTextColor(34, 34, 34)
  pdf.setFont('DejaVuSans', 'normal')

  // Remove markdown bold/italic from headings for PDF
  const cleanHeadingLine = (line: string) => {
    const headerMatch = line.match(/^(#{1,6})\s+(.*)/)
    if (headerMatch) {
      // Remove **, __, *, _ from heading text
      const cleanHeading = headerMatch[2].replace(/(\*\*|__|\*|_)(.*?)\1/g, '$2')
      return `${headerMatch[1]} ${cleanHeading}`
    }
    return line
  }
  const lines = content.split('\n').map(cleanHeadingLine)
  let i = 0
  while (i < lines.length) {
    // Check if the current line is a heading and process the heading with its block content
    const heading = lines[i].match(/^(#{1,6})\s+(.*)/)
    if (heading) {
      // Collect all lines belonging to this block: heading plus lines until next heading or empty line
      const blockLines = [lines[i]]
      let j = i + 1
      while (j < lines.length && !lines[j].match(/^(#{1,6})\s+/) && lines[j].trim() !== '') {
        blockLines.push(lines[j])
        j++
      }

      // Estimate the total height needed for the heading and its block content
      let blockHeight = 8 // Add blank space before heading
      const level = heading[1].length
      pdf.setFontSize(level === 1 ? 16 : level === 2 ? 14 : 12)
      const headingWrapped = pdf.splitTextToSize(heading[2], contentWidth)
      blockHeight += headingWrapped.length * 8
      pdf.setFontSize(12)
      for (let k = 1; k < blockLines.length; k++) {
        const line = blockLines[k]
        const ulMatch = line.match(/^\s*([-*+])\s+(.*)/)
        const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/)
        const text = ulMatch ? ulMatch[2] : olMatch ? olMatch[3] : line
        const wrapped = pdf.splitTextToSize(text, contentWidth - (ulMatch ? 8 : olMatch ? 12 : 0))
        blockHeight += wrapped.length * 7
      }

      // If the block would overflow the page, start it on a new page
      if (y + blockHeight > 200) {
        pdf.addPage()
        y = margin
      }

      // Render the heading with appropriate font size and style
      y += 10 // Use a larger and consistent blank space before every heading
      pdf.setFontSize(level === 1 ? 16 : level === 2 ? 14 : 12)
      pdf.setFont('DejaVuSans', 'bold')
      pdf.text(headingWrapped, margin, y)
      y += headingWrapped.length * 8
      pdf.setFont('DejaVuSans', 'normal')
      pdf.setFontSize(12)

      // Render the block content (lists and paragraphs) with correct indentation and wrapping
      for (let k = 1; k < blockLines.length; k++) {
        const line = blockLines[k]
        // Handle unordered list items
        const ulMatch = line.match(/^\s*([-*+])\s+(.*)/)
        if (ulMatch) {
          const wrapped = pdf.splitTextToSize(ulMatch[2], contentWidth - 8)
          for (let w = 0; w < wrapped.length; w++) {
            // Always use the same font size and baseline for marker and text
            pdf.setFont('DejaVuSans', 'bold')
            pdf.setFontSize(12)
            if (w === 0) pdf.text('•', margin, y, { baseline: 'top' })
            pdf.setFont('DejaVuSans', 'normal')
            pdf.setFontSize(12)
            renderInlineMarkdown(pdf, wrapped[w], margin + 8, y, 12)
            y += 7
          }
          continue
        }
        // Handle ordered list items
        const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/)
        if (olMatch) {
          const number = olMatch[2]
          const itemText = olMatch[3]
          const wrapped = pdf.splitTextToSize(itemText, contentWidth - 12)
          for (let w = 0; w < wrapped.length; w++) {
            pdf.setFont('DejaVuSans', 'bold')
            pdf.setFontSize(12)
            if (w === 0) pdf.text(number + '.', margin, y, { baseline: 'top' })
            pdf.setFont('DejaVuSans', 'normal')
            pdf.setFontSize(12)
            renderInlineMarkdown(pdf, wrapped[w], margin + 12, y, 12)
            y += 7
          }
          continue
        }
        // Handle paragraphs and plain text
        if (line.trim()) {
          const wrapped = pdf.splitTextToSize(line, contentWidth)
          for (let w = 0; w < wrapped.length; w++) {
            renderInlineMarkdown(pdf, wrapped[w], margin, y, 12)
            y += 7
          }
        } else {
          y += 4
        }
      }
      i = j
      continue
    }

    // Handle images that are not grouped with headings
    const imgMatch = lines[i].match(/!\[.*?\]\((.*?)\)/)
    if (imgMatch) {
      const base64 = await fetchImageAsBase64(imgMatch[1])
      if (base64) {
        try {
          pdf.addImage(base64, 'PNG', margin, y, 60, 30)
          y += 32
        } catch {
          pdf.text('[Image could not be loaded]', margin, y)
          y += 8
        }
      } else {
        pdf.text('[Image could not be loaded]', margin, y)
        y += 8
      }
      i++
      continue
    }

    // Handle unordered list items that are not after headings
    const ulMatch = lines[i].match(/^\s*([-*+])\s+(.*)/)
    if (ulMatch) {
      const wrapped = pdf.splitTextToSize(ulMatch[2], contentWidth - 8)
      for (let w = 0; w < wrapped.length; w++) {
        // Always use the same font size and baseline for marker and text
        pdf.setFont('DejaVuSans', 'bold')
        pdf.setFontSize(12)
        if (w === 0) pdf.text('•', margin, y, { baseline: 'top' })
        pdf.setFont('DejaVuSans', 'normal')
        pdf.setFontSize(12)
        renderInlineMarkdown(pdf, wrapped[w], margin + 8, y, 12)
        y += 7
      }
      i++
      continue
    }

    // Handle ordered list items that are not after headings
    const olMatch = lines[i].match(/^(\s*)(\d+)\.\s+(.*)/)
    if (olMatch) {
      const number = olMatch[2]
      const itemText = olMatch[3]
      const wrapped = pdf.splitTextToSize(itemText, contentWidth - 12)
      for (let w = 0; w < wrapped.length; w++) {
        pdf.setFont('DejaVuSans', 'bold')
        pdf.setFontSize(12)
        if (w === 0) pdf.text(number + '.', margin, y, { baseline: 'top' })
        pdf.setFont('DejaVuSans', 'normal')
        pdf.setFontSize(12)
        renderInlineMarkdown(pdf, wrapped[w], margin + 12, y, 12)
        y += 7
      }
      i++
      continue
    }

    // Handle paragraphs and plain text with inline markdown and wrapping
    if (lines[i].trim()) {
      const wrapped = pdf.splitTextToSize(lines[i], contentWidth)
      for (let w = 0; w < wrapped.length; w++) {
        renderInlineMarkdown(pdf, wrapped[w], margin, y, 12)
        y += 7
      }
    } else {
      y += 4
    }
    i++
  }

  return Buffer.from(pdf.output('arraybuffer'))
}

export async function POST(request: NextRequest) {
  try {
    const { content, sourceName } = await request.json()
    console.log(`Generating PDF for summary`)
    const pdfBuffer = await generatePDF(content)
    if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
      console.error('Invalid PDF buffer returned:', typeof pdfBuffer)
      return NextResponse.json({ error: 'Failed to generate valid PDF file' }, { status: 500 })
    }
    console.log('PDF generated successfully, buffer size:', pdfBuffer.length)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(sourceName)}_summary.pdf"`,
      },
    })
  } catch (error: unknown) {
    console.error('Error generating PDF:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { error: 'Failed to generate PDF document: ' + errorMessage },
      { status: 500 },
    )
  }
}
