// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import autoTable from 'jspdf-autotable'
import type { PdfContext, RubricCriterion, RubricLevel } from '../types'
import { FONT_SIZES, TABLE_CONFIG } from '../utils/constants'
import { getPdfLabels } from '../utils/labels'
import { addHeader } from '../components/header'
import type { AssessmentIdea, AssessmentDocxContent } from '@/lib/types/assessment-types'
import { isExplanationData, isRubricLevelArray } from '../utils/typeGuards'
import {
  REPORT_PREFIXES,
  DEMO_PREFIXES,
  INDIVIDUAL_PREFIXES,
  startsWithAny,
  removeAnyPrefix,
  matchesLevel,
  createDefaultRubricDescriptions,
} from '../utils/rubricHelpers'

export function generateProjectAssessment(
  ctx: PdfContext,
  assessment: AssessmentIdea,
  metadata: AssessmentDocxContent['metadata'],
): number {
  const isStudent = ctx.format === 'student'
  let y = ctx.currentY

  if (!isStudent) y = addProjectInfo(ctx, assessment, metadata, y)
  y = addProjectDescription(ctx, assessment, y)
  if (!isStudent) y = addGuidelinesSection(ctx, assessment, y)
  if (!isStudent) y = addRubrics(ctx, assessment.exampleQuestions[0]?.explanation, y)
  return y
}

function ensurePageSpace(ctx: PdfContext, y: number, needed: number): number {
  if (y + needed <= ctx.pageHeight - ctx.margin) return y
  ctx.pdf.addPage()
  addHeader(ctx)
  return ctx.margin
}

function addProjectInfo(
  ctx: PdfContext,
  assessment: AssessmentIdea,
  metadata: AssessmentDocxContent['metadata'],
  y: number,
): number {
  const labels = getPdfLabels(ctx.language)
  const hasAnyMeta = Boolean(
    metadata?.semester ||
      metadata?.academicYear ||
      metadata?.deadline ||
      metadata?.groupSize ||
      metadata?.projectDuration ||
      assessment.duration,
  )
  if (!hasAnyMeta) return y

  ctx.pdf.setFontSize(FONT_SIZES.subtitle)
  ctx.pdf.setFont('DejaVuSans', 'bold')
  ctx.pdf.text(labels.projectInformation, ctx.margin, y)
  y += 8
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  ctx.pdf.setFont('DejaVuSans', 'normal')

  if (metadata?.semester) y = writeMetaLine(ctx, `${labels.semester}: `, metadata.semester, y)
  if (metadata?.academicYear)
    y = writeMetaLine(ctx, `${labels.academicYear}: `, metadata.academicYear, y)
  if (metadata?.deadline)
    y = writeMetaLine(ctx, `${labels.submissionDeadline}: `, metadata.deadline, y)
  if (metadata?.groupSize)
    y = writeMetaLine(
      ctx,
      `${labels.groupSize}: `,
      `${metadata.groupSize} ${labels.membersPerGroup}`,
      y,
    )
  if (metadata?.projectDuration || assessment.duration)
    y = writeMetaLine(
      ctx,
      `${labels.duration}: `,
      metadata?.projectDuration || assessment.duration || '',
      y,
    )
  return y + 6
}

function writeMetaLine(
  ctx: PdfContext,
  prefix: string,
  value: string,
  y: number,
  lineHeight = 6,
): number {
  ctx.pdf.setFont('DejaVuSans', 'bold')
  ctx.pdf.text(prefix, ctx.margin, y)
  const prefixWidth = ctx.pdf.getTextWidth(prefix)
  ctx.pdf.setFont('DejaVuSans', 'normal')
  const wrapped = ctx.pdf.splitTextToSize(value, ctx.contentWidth - prefixWidth - 2)
  wrapped.forEach((ln: string, idx: number) => {
    ctx.pdf.text(ln, ctx.margin + (idx === 0 ? prefixWidth + 2 : 0), y + idx * lineHeight)
  })
  return y + wrapped.length * lineHeight
}

function addProjectDescription(ctx: PdfContext, assessment: AssessmentIdea, y: number): number {
  const labels = getPdfLabels(ctx.language)
  const description = assessment.exampleQuestions?.[0]?.question || ''
  if (!description.trim()) return y
  ctx.pdf.setFontSize(FONT_SIZES.subtitle)
  ctx.pdf.setFont('DejaVuSans', 'bold')
  ctx.pdf.text(labels.projectDescription, ctx.margin, y)
  y += 8
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  ctx.pdf.setFont('DejaVuSans', 'normal')

  const lines = description.split(/\n/)
  const lineHeight = 6
  for (const rawLine of lines) {
    if (rawLine.trim().length === 0) {
      y += lineHeight // preserve blank line spacing
      continue
    }
    // Detect bullets / numbering
    const bulletMatch = rawLine.match(
      /^(\s*)(([-*+•])|(\d+\.|[a-zA-Z]\.|[ivxlcdmIVXLCDM]+\.))\s+(.*)/,
    )
    let indentLevel = 0
    let bulletSymbol = ''
    let content = rawLine
    if (bulletMatch) {
      const indentRaw = bulletMatch[1].replace(/\t/g, '    ')
      indentLevel = Math.floor(indentRaw.length / 4)
      bulletSymbol = bulletMatch[3] ? '•' : bulletMatch[4]
      // Group 5 holds the remaining content (regex has 5 capturing groups total)
      content = bulletMatch[5]
    }

    // Inline header **Header:** value
    if (typeof content !== 'string') content = ''
    if (content && !content.includes('**')) {
      const colonMatch = content.match(/^([^:]+):\s*(.*)$/)
      if (colonMatch) {
        const prefix = colonMatch[1].trim()
        const rest = colonMatch[2]
        content = `**${prefix}**${rest ? `: ${rest}` : ':'}`
      } else {
        const parenMatch = content.match(/^([^()]+)\s*\(([^)]+)\)\s*$/)
        if (parenMatch) {
          content = `**${parenMatch[1].trim()}** (${parenMatch[2].trim()})`
        }
      }
    }
    // Section header **Header** (alone)
    const headerAlone = content.match(/^\*\*(.+)\*\*:?$/)
    if (headerAlone) {
      y = ensurePageSpace(ctx, y, lineHeight)
      ctx.pdf.setFont('DejaVuSans', 'bold')
      ctx.pdf.setFontSize(FONT_SIZES.subtitle)
      const headerText = headerAlone[1].trim()
      ctx.pdf.text(headerText, ctx.margin + indentLevel * 8, y)
      ctx.pdf.setFont('DejaVuSans', 'normal')
      ctx.pdf.setFontSize(FONT_SIZES.standard)
      y += lineHeight + 2
      continue
    }

    // Bullet / numbered line normal content (render with bold segments)
    y = renderLineWithBold(ctx, content, y, {
      indentLevel,
      bulletSymbol,
    })
  }
  return y + 4
}

function renderLineWithBold(
  ctx: PdfContext,
  text: string,
  y: number,
  opts: { indentLevel?: number; bulletSymbol?: string } = {},
): number {
  const { indentLevel = 0, bulletSymbol = '' } = opts
  const lineHeight = 6
  const maxWidth = ctx.contentWidth
  const baseX = ctx.margin + indentLevel * 8
  const bulletOffset = bulletSymbol ? 6 : 0
  const maxLineWidth = Math.max(1, maxWidth - indentLevel * 8 - bulletOffset)

  const separatorCandidate = text.replace(/\s+/g, '')
  if (
    !bulletSymbol &&
    separatorCandidate.length > 0 &&
    (/^=+$/.test(separatorCandidate) || /^-+$/.test(separatorCandidate))
  ) {
    return y
  }

  // Parse **bold** segments
  const segments: Array<{ text: string; bold: boolean }> = []
  const regex = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text))) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), bold: false })
    segments.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false })

  // Word-level wrapping preserving bold boundaries
  const words: Array<{ w: string; bold: boolean }> = []
  segments.forEach((seg) => {
    seg.text.split(/(\s+)/).forEach((token) => {
      if (token.length === 0) return
      words.push({ w: token, bold: seg.bold })
    })
  })

  let currentLine: Array<{ w: string; bold: boolean }> = []
  let currentWidth = 0
  const renderedLines: Array<Array<{ w: string; bold: boolean }>> = []

  const getFontState = () => {
    const fontInfo = ctx.pdf.getFont()
    return {
      name: (fontInfo as unknown as { fontName?: string }).fontName || 'DejaVuSans',
      style: fontInfo.fontStyle || 'normal',
    }
  }

  const measure = (token: string, bold: boolean) => {
    if (!token) return 0
    const prev = getFontState()
    ctx.pdf.setFont('DejaVuSans', bold ? 'bold' : 'normal')
    const width = ctx.pdf.getTextWidth(token)
    ctx.pdf.setFont(prev.name, prev.style)
    return width
  }

  const splitTokenToFit = (token: string, bold: boolean) => {
    // Keep whitespace tokens untouched to preserve spacing
    if (!token.trim()) return [token]
    const pieces: string[] = []
    let buffer = ''
    for (const ch of token) {
      const candidate = buffer + ch
      if (measure(candidate, bold) > maxLineWidth) {
        if (buffer) {
          pieces.push(buffer)
          buffer = ch
        } else {
          // Single character exceeds width (very rare); push as-is to avoid infinite loop
          pieces.push(ch)
          buffer = ''
        }
      } else {
        buffer = candidate
      }
    }
    if (buffer) pieces.push(buffer)
    return pieces.length > 0 ? pieces : [token]
  }

  const normalizedWords = words.flatMap((wordObj) => {
    const tokenWidth = measure(wordObj.w, wordObj.bold)
    if (tokenWidth <= maxLineWidth || !wordObj.w.trim()) return [wordObj]
    return splitTokenToFit(wordObj.w, wordObj.bold).map((part) => ({
      w: part,
      bold: wordObj.bold,
    }))
  })

  normalizedWords.forEach((wordObj) => {
    const wWidth = measure(wordObj.w, wordObj.bold)
    if (currentLine.length === 0) {
      currentLine.push(wordObj)
      currentWidth = wWidth
      return
    }
    if (currentWidth + wWidth > maxLineWidth) {
      renderedLines.push(currentLine)
      currentLine = [wordObj]
      currentWidth = wWidth
    } else {
      currentLine.push(wordObj)
      currentWidth += wWidth
    }
  })
  if (currentLine.length) renderedLines.push(currentLine)

  renderedLines.forEach((line, idx) => {
    y = ensurePageSpace(ctx, y, lineHeight)
    let x = baseX

    if (idx === 0 && bulletSymbol) {
      ctx.pdf.setFont('DejaVuSans', 'bold')
      ctx.pdf.text(bulletSymbol, x, y)
      x += bulletOffset
    }
    line.forEach((part) => {
      ctx.pdf.setFont('DejaVuSans', part.bold ? 'bold' : 'normal')
      ctx.pdf.text(part.w, x, y)
      x += ctx.pdf.getTextWidth(part.w)
    })
    y += lineHeight
  })
  return y
}

function addGuidelinesSection(ctx: PdfContext, assessment: AssessmentIdea, y: number): number {
  const labels = getPdfLabels(ctx.language)
  const blocks: string[] = []
  const second = assessment.exampleQuestions[1]
  if (second?.question) blocks.push(second.question)
  assessment.exampleQuestions.forEach((q, idx) => {
    if (q.correctAnswer) {
      const prefix = assessment.exampleQuestions.length > 1 ? `Q${idx + 1} ` : ''
      blocks.push(`${prefix}${q.correctAnswer}`)
    }
  })
  assessment.exampleQuestions.forEach((q) => {
    if (typeof q.explanation === 'string') blocks.push(q.explanation)
  })
  const text = blocks
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n')
  if (!text) return y
  ctx.pdf.addPage()
  addHeader(ctx)
  y = ctx.margin
  ctx.pdf.setFontSize(FONT_SIZES.subtitle)
  ctx.pdf.setFont('DejaVuSans', 'bold')
  ctx.pdf.text(labels.modelAnswerGuidelines, ctx.margin, y)
  y += 8
  ctx.pdf.setFont('DejaVuSans', 'normal')
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  const lines = text.split(/\n/)
  for (const line of lines) {
    if (line.trim().length === 0) {
      y += 6
      continue
    }
    y = renderLineWithBold(ctx, line, y)
  }
  return y + 4
}

function addRubrics(ctx: PdfContext, explanation: unknown, y: number): number {
  const labels = getPdfLabels(ctx.language)
  let criteria: RubricCriterion[] = []
  let rubricLevels: RubricLevel[] = []
  if (isExplanationData(explanation)) {
    if (Array.isArray(explanation.criteria)) {
      criteria = explanation.criteria.filter((c) => typeof c === 'object') as RubricCriterion[]
    }
    if (explanation.rubricLevels && isRubricLevelArray(explanation.rubricLevels)) {
      rubricLevels = explanation.rubricLevels
    }
  }

  ctx.pdf.addPage()
  addHeader(ctx)
  y = ctx.margin
  ctx.pdf.setFontSize(FONT_SIZES.rubricTitle)
  ctx.pdf.setFont('DejaVuSans', 'bold')
  ctx.pdf.text(labels.rubricTitle, ctx.pageWidth / 2, y, { align: 'center' })
  y += 10
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  ctx.pdf.setFont('DejaVuSans', 'normal')
  ctx.pdf.text(labels.gradingScale, ctx.margin, y)
  y += 10

  const reportCriteria = criteria.filter((c) => startsWithAny(c.name, REPORT_PREFIXES))
  const demoCriteria = criteria.filter((c) => startsWithAny(c.name, DEMO_PREFIXES))
  const individualCriteria = criteria.filter((c) => startsWithAny(c.name, INDIVIDUAL_PREFIXES))
  const remainingCriteria = criteria.filter(
    (c) => ![reportCriteria, demoCriteria, individualCriteria].some((group) => group.includes(c)),
  )

  function buildTableBody(catCriteria: RubricCriterion[]): string[][] {
    return catCriteria.map((criterion) => {
      const rawName = criterion.name || ''
      const displayName = removeAnyPrefix(removeAnyPrefix(rawName, REPORT_PREFIXES), DEMO_PREFIXES)
      const baseName = removeAnyPrefix(displayName, INDIVIDUAL_PREFIXES)
      const defaults = createDefaultRubricDescriptions(baseName, ctx.language)
      let excellent = defaults.excellent
      let good = defaults.good
      let average = defaults.average
      let acceptable = defaults.acceptable
      let poor = defaults.poor
      rubricLevels.forEach((level) => {
        let txt: string | undefined
        const keys = Object.keys(level.criteria || {})
        const candidate = keys.find(
          (k) => k === rawName || k === baseName || k.toLowerCase() === baseName.toLowerCase(),
        )
        if (candidate) txt = level.criteria[candidate]
        if (!txt) return
        if (matchesLevel(level.level, 'excellent', ctx.language)) excellent = txt
        else if (matchesLevel(level.level, 'good', ctx.language)) good = txt
        else if (matchesLevel(level.level, 'average', ctx.language)) average = txt
        else if (matchesLevel(level.level, 'acceptable', ctx.language)) acceptable = txt
        else if (matchesLevel(level.level, 'poor', ctx.language)) poor = txt
      })
      const weightSuffix = criterion.weight ? ` (${criterion.weight}%)` : ''
      return [`${baseName}${weightSuffix}`, excellent, good, average, acceptable, poor]
    })
  }

  function renderCategory(label: string, cat: RubricCriterion[]) {
    if (!cat.length) return
    ctx.pdf.setFont('DejaVuSans', 'bold')
    ctx.pdf.setFontSize(FONT_SIZES.subtitle)
    ctx.pdf.text(label, ctx.margin, y)
    y += 8
    ctx.pdf.setFont('DejaVuSans', 'normal')
    ctx.pdf.setFontSize(FONT_SIZES.standard)
    autoTable(ctx.pdf, {
      head: [
        [
          labels.criteria,
          labels.excellentHeader,
          labels.goodHeader,
          labels.averageHeader,
          labels.acceptableHeader,
          labels.poorHeader,
        ],
      ],
      body: buildTableBody(cat),
      startY: y,
      margin: { left: ctx.margin, right: ctx.margin },
      tableWidth: TABLE_CONFIG.availableWidth,
      styles: {
        overflow: 'linebreak',
        cellPadding: 2,
        fontSize: FONT_SIZES.rubricContent,
        font: 'DejaVuSans',
        halign: 'left',
        valign: 'top',
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: FONT_SIZES.rubricContent,
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: TABLE_CONFIG.firstColumnWidth },
        1: { cellWidth: TABLE_CONFIG.otherColumnWidth },
        2: { cellWidth: TABLE_CONFIG.otherColumnWidth },
        3: { cellWidth: TABLE_CONFIG.otherColumnWidth },
        4: { cellWidth: TABLE_CONFIG.otherColumnWidth },
        5: { cellWidth: TABLE_CONFIG.otherColumnWidth },
      },
    })
    const finalY = (ctx.pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY
    y = finalY + 10
    if (y > ctx.pageHeight - ctx.margin - 30) {
      ctx.pdf.addPage()
      addHeader(ctx)
      y = ctx.margin
    }
  }

  if (reportCriteria.length) renderCategory(labels.reportSection, reportCriteria)
  if (demoCriteria.length) renderCategory(labels.demoSection, demoCriteria)
  if (individualCriteria.length) renderCategory(labels.individualSection, individualCriteria)
  if (remainingCriteria.length) renderCategory('Additional Criteria', remainingCriteria)

  const producedAny =
    reportCriteria.length ||
    demoCriteria.length ||
    individualCriteria.length ||
    remainingCriteria.length
  if (!producedAny) {
    const fallback = [
      ['Content Quality (25%)', 'Excellent content', 'Good', 'Average', 'Acceptable', 'Poor'],
      ['Implementation (25%)', 'Excellent implementation', 'Good', 'Average', 'Acceptable', 'Poor'],
      ['Presentation (25%)', 'Excellent presentation', 'Good', 'Average', 'Acceptable', 'Poor'],
      [
        'Individual Contribution (25%)',
        'Excellent contribution',
        'Good',
        'Average',
        'Acceptable',
        'Poor',
      ],
    ]
    autoTable(ctx.pdf, {
      head: [
        [
          labels.criteria,
          labels.excellentHeader,
          labels.goodHeader,
          labels.averageHeader,
          labels.acceptableHeader,
          labels.poorHeader,
        ],
      ],
      body: fallback,
      startY: y,
      margin: { left: ctx.margin, right: ctx.margin },
      tableWidth: TABLE_CONFIG.availableWidth,
      styles: {
        overflow: 'linebreak',
        cellPadding: 2,
        fontSize: FONT_SIZES.rubricContent,
        font: 'DejaVuSans',
        halign: 'left',
        valign: 'top',
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: FONT_SIZES.rubricContent,
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: TABLE_CONFIG.firstColumnWidth },
        1: { cellWidth: TABLE_CONFIG.otherColumnWidth },
        2: { cellWidth: TABLE_CONFIG.otherColumnWidth },
        3: { cellWidth: TABLE_CONFIG.otherColumnWidth },
        4: { cellWidth: TABLE_CONFIG.otherColumnWidth },
        5: { cellWidth: TABLE_CONFIG.otherColumnWidth },
      },
    })
    const finalY = (ctx.pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY
    y = finalY + 10
  }
  return y
}
