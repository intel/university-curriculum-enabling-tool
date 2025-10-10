// Text processing helpers for DOCX assessment generation
export interface BoldSegment {
  text: string
  bold: boolean
}

export function processTextWithBold(text: string): {
  text: string
  hasBold: boolean
  boldSegments: BoldSegment[]
} {
  const boldPattern = /\*\*(.+?)\*\*/g
  const hasBold = boldPattern.test(text)
  boldPattern.lastIndex = 0
  if (!hasBold) return { text, hasBold, boldSegments: [{ text, bold: false }] }
  const boldSegments: BoldSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      boldSegments.push({ text: text.substring(lastIndex, match.index), bold: false })
    }
    boldSegments.push({ text: match[1], bold: true })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) boldSegments.push({ text: text.substring(lastIndex), bold: false })
  const cleanedText = text.replace(boldPattern, '$1')
  return { text: cleanedText, hasBold, boldSegments }
}
