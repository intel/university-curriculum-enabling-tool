import type { SectionRenderer } from '../../types'
import { LABELS } from '../../labels'
import { addPageBreak, ensureSpace, wrapText } from '../../utils'
import { FONT_SIZES } from '../../constants'
import { drawQuestionContainer, drawQuestionNumber, drawInlineStripeHeader } from './helpers'
import { renderAssessmentCriteria } from './criteria'

export const renderQuizAssessments: SectionRenderer = (ctx, content) => {
  const quizIdeas = (content.assessmentIdeas || []).filter((i) =>
    i.type.toLowerCase().includes('quiz'),
  )
  if (quizIdeas.length === 0) return
  const { pdf, lang } = ctx

  for (const idea of quizIdeas) {
    // Description box metrics
    const descLines = wrapText(ctx, idea.description, ctx.contentWidth - 10)
    const descHeight = descLines.length * 6 + 5
    const exampleHeaderHeight = 15
    const descBoxHeight = 22 + descHeight + exampleHeaderHeight
    ensureSpace(ctx, descBoxHeight + 10)

    // Card background
    pdf.setFillColor(245, 247, 250)
    pdf.roundedRect(ctx.margin, ctx.y, ctx.contentWidth, descBoxHeight, 3, 3, 'F')
    // Top stripe
    pdf.setFillColor(79, 70, 229)
    pdf.rect(ctx.margin, ctx.y, ctx.contentWidth, 5, 'F')

    // Title & meta
    pdf.setFontSize(FONT_SIZES.subtitle)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.text(idea.type, ctx.margin + 10, ctx.y + 13)

    pdf.setFontSize(FONT_SIZES.small)
    pdf.setFont('helvetica', 'normal')
    pdf.text(
      `⏱ ${LABELS[lang].duration}: ${idea.duration}`,
      ctx.margin + ctx.contentWidth - 70,
      ctx.y + 13,
    )

    // Description
    pdf.setFontSize(FONT_SIZES.standard)
    pdf.setFont('helvetica', 'normal')
    pdf.text(descLines, ctx.margin + 10, ctx.y + 22)

    // Example Questions header (using helper stripe)
    drawInlineStripeHeader(ctx, LABELS[lang].exampleQuestions, 22 + descHeight, {
      stripeColor: [230, 230, 250],
      textColor: [79, 70, 229],
    })

    ctx.y += descBoxHeight + 10

    // Questions
    for (let q = 0; q < idea.exampleQuestions.length; q++) {
      const question = idea.exampleQuestions[q]
      if (q > 0) {
        addPageBreak(ctx)
      }
      const questionLines = wrapText(ctx, question.question, ctx.contentWidth - 50)
      const questionHeight = Math.max(questionLines.length * 6 + 10, 30)

      let optionsHeight = 0
      if (question.options && question.options.length > 0) {
        for (let o = 0; o < question.options.length; o++) {
          const optionLines = wrapText(ctx, question.options[o], ctx.contentWidth - 70)
          optionsHeight += Math.max(optionLines.length * 6, 15)
        }
      }

      let answerHeight = 0
      let answerLines: string[] = []
      if (question.correctAnswer) {
        answerLines = wrapText(ctx, question.correctAnswer, ctx.contentWidth - 100)
        answerHeight = Math.max(answerLines.length * 6, 15) + 2
      }

      let explanationHeight = 0
      let explanationLines: string[] = []
      if (question.explanation) {
        const explanationText =
          typeof question.explanation === 'string'
            ? question.explanation
            : JSON.stringify(question.explanation, null, 2)
        explanationLines = wrapText(ctx, explanationText, ctx.contentWidth - 100)
        explanationHeight = Math.max(explanationLines.length * 6, 15) + 2
      }

      const totalBoxHeight =
        questionHeight +
        optionsHeight +
        (answerHeight ? answerHeight + 5 : 0) +
        (explanationHeight ? explanationHeight + 5 : 0) +
        20
      ensureSpace(ctx, totalBoxHeight + 15)

      // Container & number using helpers
      drawQuestionContainer(ctx, totalBoxHeight, { inset: 10 })
      drawQuestionNumber(ctx, q, { xOffset: 25, yOffset: 15, color: [79, 70, 229] })

      // Question text
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(FONT_SIZES.standard)
      pdf.setFont('helvetica', 'normal')
      pdf.text(questionLines, ctx.margin + 40, ctx.y + 15)
      let qBoxY = ctx.y + 15 + questionLines.length * 6 + 5

      // Options
      if (question.options && question.options.length > 0) {
        for (let o = 0; o < question.options.length; o++) {
          pdf.setFillColor(245, 247, 250)
          pdf.roundedRect(ctx.margin + 30, qBoxY, ctx.contentWidth - 60, 10, 2, 2, 'F')

          pdf.setFillColor(200, 200, 230)
          pdf.circle(ctx.margin + 40, qBoxY + 5, 5, 'F')
          pdf.setTextColor(0, 0, 0)
          pdf.setFontSize(FONT_SIZES.small)
          pdf.setFont('helvetica', 'bold')
          pdf.text(String.fromCharCode(65 + o), ctx.margin + 40, qBoxY + 7, { align: 'center' })

          pdf.setFont('helvetica', 'normal')
          const optionLines = wrapText(ctx, question.options[o], ctx.contentWidth - 80)
          pdf.text(optionLines, ctx.margin + 50, qBoxY + 5)
          qBoxY += Math.max(optionLines.length * 6, 15)
        }
      }

      // Correct Answer
      if (question.correctAnswer) {
        qBoxY += 5
        pdf.setFillColor(230, 250, 230)
        pdf.roundedRect(ctx.margin + 30, qBoxY, ctx.contentWidth - 60, answerHeight, 2, 2, 'F')

        pdf.setTextColor(0, 130, 0)
        pdf.setFontSize(FONT_SIZES.small)
        pdf.setFont('helvetica', 'bold')
        pdf.text(LABELS[lang].correctAnswer, ctx.margin + 40, qBoxY + 5)

        pdf.setTextColor(0, 0, 0)
        pdf.setFont('helvetica', 'normal')
        pdf.text(answerLines, ctx.margin + 90, qBoxY + 5)
        qBoxY += answerHeight
      }

      // Explanation
      if (question.explanation) {
        qBoxY += 5
        pdf.setFillColor(240, 245, 250)
        pdf.roundedRect(ctx.margin + 30, qBoxY, ctx.contentWidth - 60, explanationHeight, 2, 2, 'F')

        pdf.setTextColor(0, 0, 150)
        pdf.setFontSize(FONT_SIZES.small)
        pdf.setFont('helvetica', 'bold')
        pdf.text(LABELS[lang].explanation, ctx.margin + 40, qBoxY + 5)

        pdf.setTextColor(0, 0, 0)
        pdf.setFont('helvetica', 'normal')
        pdf.text(explanationLines, ctx.margin + 90, qBoxY + 5)
        qBoxY += explanationHeight

        // Attempt to parse criteria inside explanation if object
        if (typeof question.explanation === 'object') {
          const maybe = question.explanation as {
            criteria?: Array<{ name?: string; weight?: number; description?: string }>
          }
          if (Array.isArray(maybe.criteria) && maybe.criteria.length > 0) {
            // Move context y below question card before rendering criteria block full width
            ctx.y += qBoxY - ctx.y + 20
            renderAssessmentCriteria(ctx, maybe.criteria, {
              headingColor: [79, 70, 229],
              stripeColor: [230, 230, 250],
            })
          }
        }
      }

      ctx.y += totalBoxHeight + 15
    }
  }
}
