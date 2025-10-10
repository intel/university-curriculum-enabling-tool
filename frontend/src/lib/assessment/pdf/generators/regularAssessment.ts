// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { PdfContext } from '../types'
import { FONT_SIZES } from '../utils/constants'
import { getPdfLabels } from '../utils/labels'
import { addHeader } from '../components/header'
import type { AssessmentIdea, AssessmentDocxContent } from '@/lib/types/assessment-types'

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
  ctx.pdf.setFont('helvetica', 'normal')
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
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  ctx.pdf.setFont('helvetica', 'bold')
  ctx.pdf.text(`${questionNumber}.`, ctx.margin, yPosition)
  yPosition += 6

  // Question text
  ctx.pdf.setFontSize(FONT_SIZES.standard)
  ctx.pdf.setFont('helvetica', 'normal')
  const questionLines = ctx.pdf.splitTextToSize(question.question, ctx.contentWidth - 10)

  // Check if we need a new page
  if (yPosition + questionLines.length * 6 > ctx.pageHeight - ctx.margin) {
    ctx.pdf.addPage()
    yPosition = ctx.margin
    addHeader(ctx)
  }

  ctx.pdf.text(questionLines, ctx.margin + 10, yPosition)
  yPosition += questionLines.length * 6 + 5

  // Add options if available
  if (question.options && question.options.length > 0) {
    yPosition += 5
    ctx.pdf.setFont('helvetica', 'bold')
    ctx.pdf.text(labels.options, ctx.margin + 10, yPosition)
    yPosition += 6
    ctx.pdf.setFont('helvetica', 'normal')

    for (let j = 0; j < question.options.length; j++) {
      const optionLines = ctx.pdf.splitTextToSize(question.options[j], ctx.contentWidth - 20)

      // Check if we need a new page
      if (yPosition + optionLines.length * 6 > ctx.pageHeight - ctx.margin) {
        ctx.pdf.addPage()
        yPosition = ctx.margin
        addHeader(ctx)
      }

      ctx.pdf.text(`${String.fromCharCode(65 + j)}.`, ctx.margin + 10, yPosition)
      ctx.pdf.text(optionLines, ctx.margin + 20, yPosition)
      yPosition += optionLines.length * 6
    }
  }

  // Add model answer if in lecturer format
  if (!isStudentFormat && question.correctAnswer) {
    yPosition += 10
    ctx.pdf.setFont('helvetica', 'bold')
    ctx.pdf.text(`${labels.modelAnswer}:`, ctx.margin + 10, yPosition)
    yPosition += 6
    ctx.pdf.setFont('helvetica', 'normal')

    const answerLines = ctx.pdf.splitTextToSize(question.correctAnswer, ctx.contentWidth - 20)

    // Check if we need a new page
    if (yPosition + answerLines.length * 6 > ctx.pageHeight - ctx.margin) {
      ctx.pdf.addPage()
      yPosition = ctx.margin
      addHeader(ctx)
    }

    ctx.pdf.text(answerLines, ctx.margin + 10, yPosition)
    yPosition += answerLines.length * 6
  }

  // Add marking criteria if in lecturer format
  if (!isStudentFormat && question.explanation) {
    yPosition += 10
    ctx.pdf.setFont('helvetica', 'bold')
    ctx.pdf.text(`${labels.markingCriteria}:`, ctx.margin + 10, yPosition)
    yPosition += 6
    ctx.pdf.setFont('helvetica', 'normal')

    let explanationText = ''

    if (typeof question.explanation === 'string') {
      explanationText = question.explanation
    } else if (typeof question.explanation === 'object') {
      // Format criteria
      if (Array.isArray(question.explanation.criteria)) {
        explanationText += 'Criteria:\n'
        for (const criterion of question.explanation.criteria) {
          if (typeof criterion === 'object' && criterion !== null && 'name' in criterion) {
            explanationText += `- ${criterion.name} (${criterion.weight || 0}%): ${
              criterion.description || ''
            }\n`
          } else if (typeof criterion === 'string') {
            explanationText += `- ${criterion}\n`
          }
        }
      }

      // Format mark allocation
      if (Array.isArray(question.explanation.markAllocation)) {
        explanationText += '\nMark Allocation:\n'
        for (const item of question.explanation.markAllocation) {
          explanationText += `- ${item.component} (${item.marks} marks): ${
            item.description || ''
          }\n`
        }
      }
    }

    const explanationLines = ctx.pdf.splitTextToSize(explanationText, ctx.contentWidth - 20)

    // Check if we need a new page
    if (yPosition + explanationLines.length * 6 > ctx.pageHeight - ctx.margin) {
      ctx.pdf.addPage()
      yPosition = ctx.margin
      addHeader(ctx)
    }

    ctx.pdf.text(explanationLines, ctx.margin + 10, yPosition)
    yPosition += explanationLines.length * 6
  }

  return yPosition + 15
}
