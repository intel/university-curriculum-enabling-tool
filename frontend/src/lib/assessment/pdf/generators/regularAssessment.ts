// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { PdfContext } from '../types'
import { FONT_SIZES } from '../utils/constants'
import { getPdfLabels } from '../utils/labels'
import { addHeader } from '../components/header'
import type {
  AssessmentIdea,
  AssessmentDocxContent,
  ExplanationObject,
} from '@/lib/types/assessment-types'

const LINE_HEIGHT = 6

function ensureLineSpace(
  ctx: PdfContext,
  yPosition: number,
  requiredHeight: number = LINE_HEIGHT,
): number {
  const limit = ctx.pageHeight - ctx.margin
  if (yPosition + requiredHeight > limit) {
    ctx.pdf.addPage()
    addHeader(ctx)
    return ctx.margin
  }
  return yPosition
}

function addGap(ctx: PdfContext, yPosition: number, gap: number = 10): number {
  const limit = ctx.pageHeight - ctx.margin
  let nextY = yPosition + gap
  if (nextY > limit) {
    ctx.pdf.addPage()
    addHeader(ctx)
    nextY = ctx.margin + gap
  }
  return nextY
}

function writeWrappedLines(
  ctx: PdfContext,
  lines: string[],
  indent: number,
  startY: number,
  lineHeight = LINE_HEIGHT,
): number {
  const limit = ctx.pageHeight - ctx.margin
  let currentY = startY

  for (const line of lines) {
    if (currentY + lineHeight > limit) {
      ctx.pdf.addPage()
      addHeader(ctx)
      currentY = ctx.margin
    }

    ctx.pdf.text(line, ctx.margin + indent, currentY)
    currentY += lineHeight
  }

  return currentY
}

/**
 * Generate PDF for regular assessment types (quiz, exam, etc.)
 */
export function generateRegularAssessment(
  ctx: PdfContext,
  assessment: AssessmentIdea,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  metadata: AssessmentDocxContent['metadata'],
): number {
  const isStudentFormat = ctx.format === 'student'
  let yPosition = ctx.currentY

  // Add instructions
  yPosition = addInstructions(ctx, assessment, yPosition)

  // Add page break after instructions
  ctx.pdf.addPage()
  yPosition = ctx.margin
  addHeader(ctx)

  // Process each question
  for (let i = 0; i < assessment.exampleQuestions.length; i++) {
    const question = assessment.exampleQuestions[i]
    yPosition = addQuestion(ctx, question, i + 1, isStudentFormat, yPosition)

    // Add page break after each question except the last one
    if (i < assessment.exampleQuestions.length - 1) {
      ctx.pdf.addPage()
      yPosition = ctx.margin
      addHeader(ctx)
    }
  }

  return yPosition
}

function addInstructions(ctx: PdfContext, assessment: AssessmentIdea, yPosition: number): number {
  const labels = getPdfLabels(ctx.language)

  // Duration
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  ctx.pdf.setFont('DejaVuSans', 'normal')
  ctx.pdf.text(`${labels.duration}: ${assessment.duration}`, ctx.pageWidth / 2, yPosition, {
    align: 'center',
  })
  yPosition += 10

  // Instructions
  const instructionTexts = [
    labels.instructions1,
    `${labels.instructions2Prefix} ${assessment.exampleQuestions.length} ${labels.questions}.`,
    labels.instructions3,
    labels.instructions4,
  ]

  for (const instruction of instructionTexts) {
    const lines = ctx.pdf.splitTextToSize(instruction, ctx.contentWidth)
    ctx.pdf.text(lines, ctx.margin, yPosition)
    yPosition += lines.length * 6
  }

  return yPosition + 4
}

function addQuestion(
  ctx: PdfContext,
  question: AssessmentIdea['exampleQuestions'][0],
  questionNumber: number,
  isStudentFormat: boolean,
  yPosition: number,
): number {
  const labels = getPdfLabels(ctx.language)

  // Question number
  yPosition = ensureLineSpace(ctx, yPosition)
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  ctx.pdf.setFont('DejaVuSans', 'bold')
  ctx.pdf.text(`${questionNumber}.`, ctx.margin, yPosition)
  yPosition += LINE_HEIGHT

  // Question text
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  ctx.pdf.setFont('DejaVuSans', 'normal')
  const questionText = (question.question || '').trim()
  if (questionText.length > 0) {
    const questionLines = ctx.pdf.splitTextToSize(questionText, ctx.contentWidth - 10)
    yPosition = writeWrappedLines(ctx, questionLines, 10, yPosition)
  }
  yPosition += 5

  // Add options if available
  if (question.options && question.options.length > 0) {
    yPosition = ensureLineSpace(ctx, yPosition)
    ctx.pdf.setFont('DejaVuSans', 'bold')
    ctx.pdf.text(labels.options, ctx.margin + 10, yPosition)
    yPosition += LINE_HEIGHT
    ctx.pdf.setFont('DejaVuSans', 'normal')

    for (let j = 0; j < question.options.length; j++) {
      yPosition = ensureLineSpace(ctx, yPosition)
      const optionLines = ctx.pdf.splitTextToSize(question.options[j], ctx.contentWidth - 20)
      ctx.pdf.text(`${String.fromCharCode(65 + j)}.`, ctx.margin + 10, yPosition)
      yPosition = writeWrappedLines(ctx, optionLines, 20, yPosition)
    }
    yPosition += 5
  }

  // Add model answer if in lecturer format
  if (!isStudentFormat) {
    const answerText = (question.correctAnswer || '').trim()
    if (answerText.length > 0) {
      const answerLines = ctx.pdf.splitTextToSize(answerText, ctx.contentWidth - 20)
      yPosition = addGap(ctx, yPosition, 10)
      yPosition = ensureLineSpace(ctx, yPosition)
      ctx.pdf.setFont('DejaVuSans', 'bold')
      ctx.pdf.text(`${labels.modelAnswer}:`, ctx.margin + 10, yPosition)
      yPosition += LINE_HEIGHT
      ctx.pdf.setFont('DejaVuSans', 'normal')

      yPosition = writeWrappedLines(ctx, answerLines, 10, yPosition)
      yPosition += 5
    }
  }

  // Add marking criteria if in lecturer format
  if (!isStudentFormat && question.explanation) {
    let combinedExplanation = ''

    if (typeof question.explanation === 'string') {
      combinedExplanation = question.explanation.trim()
    } else if (typeof question.explanation === 'object') {
      const explanationObj = question.explanation as ExplanationObject
      const criteriaEntries: string[] = []
      const criteriaMeta = new Map<string, { description?: string; weight?: number }>()
      if (Array.isArray(explanationObj.criteria)) {
        for (const criterion of explanationObj.criteria) {
          if (
            typeof criterion === 'object' &&
            criterion !== null &&
            'name' in criterion &&
            typeof criterion.name === 'string'
          ) {
            const criterionName = criterion.name.trim()
            criteriaEntries.push(
              `- ${criterionName} (${criterion.weight || 0}%): ${criterion.description || ''}`,
            )
            criteriaMeta.set(criterionName.toLowerCase(), {
              description: criterion.description?.trim(),
              weight: typeof criterion.weight === 'number' ? criterion.weight : undefined,
            })
          } else if (typeof criterion === 'string') {
            criteriaEntries.push(`- ${criterion}`)
          }
        }
      }

      const allocationEntries: string[] = []
      if (Array.isArray(explanationObj.markAllocation)) {
        let totalMarks = 0
        for (const item of explanationObj.markAllocation) {
          const componentName = (item.component || '').toString().trim()
          const marks = typeof item.marks === 'number' ? item.marks : Number(item.marks) || 0
          totalMarks += Number.isFinite(marks) ? marks : 0
          const allocationKey = componentName.toLowerCase()
          const criterionMeta = criteriaMeta.get(allocationKey)
          const criterionDescription = criterionMeta?.description
          const criterionWeight = criterionMeta?.weight
          const hasDistinctDescription =
            item.description &&
            item.description.trim() &&
            item.description.trim() !== criterionDescription

          const baseLine = `- ${componentName} (${marks} marks${
            typeof criterionWeight === 'number' ? ` / ${criterionWeight}%` : ''
          })`
          allocationEntries.push(
            hasDistinctDescription ? `${baseLine}: ${item.description?.trim()}` : baseLine,
          )
        }

        const explicitTotal =
          typeof explanationObj.totalMarks === 'number' ? explanationObj.totalMarks : undefined
        const summaryTotal = explicitTotal ?? totalMarks
        if (summaryTotal > 0) {
          allocationEntries.unshift(`Total marks: ${summaryTotal}`)
        }
      }

      const sections: string[] = []
      if (criteriaEntries.length > 0) {
        sections.push(`Criteria:\n${criteriaEntries.join('\n\n')}`)
      }
      if (allocationEntries.length > 0) {
        sections.push(`Mark Allocation:\n${allocationEntries.join('\n\n')}`)
      }

      combinedExplanation = sections.join('\n\n\n')
    }

    if (combinedExplanation.length > 0) {
      const explanationLines = ctx.pdf.splitTextToSize(combinedExplanation, ctx.contentWidth - 20)
      yPosition = addGap(ctx, yPosition, 10)
      yPosition = ensureLineSpace(ctx, yPosition)
      ctx.pdf.setFont('DejaVuSans', 'bold')
      ctx.pdf.text(`${labels.markingCriteria}:`, ctx.margin + 10, yPosition)
      yPosition += LINE_HEIGHT
      ctx.pdf.setFont('DejaVuSans', 'normal')

      yPosition = writeWrappedLines(ctx, explanationLines, 10, yPosition)
      yPosition += 5
    }
  }

  return yPosition + 15
}
