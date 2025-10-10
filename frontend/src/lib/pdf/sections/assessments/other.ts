import type { SectionRenderer } from '../../types'
import { LABELS } from '../../labels'
import { addPageBreak, ensureSpace, wrapText } from '../../utils'
import { FONT_SIZES } from '../../constants'
import { drawQuestionContainer, drawQuestionNumber } from './helpers'
import { renderAssessmentCriteria } from './criteria'

// Renders miscellaneous assessment ideas (identified by type including 'project', 'assignment', or generic not quiz/discussion)
export const renderOtherAssessments: SectionRenderer = (ctx, content) => {
  const ideas = (content.assessmentIdeas || []).filter((i) => {
    const t = i.type.toLowerCase()
    return !t.includes('quiz') && !t.includes('discussion')
  })
  if (ideas.length === 0) return
  const { pdf, lang } = ctx

  addPageBreak(ctx)
  // Section header handled externally (assessmentIdeas already added); we add specific label
  pdf.setFontSize(FONT_SIZES.sectionTitle)
  pdf.setTextColor(16, 185, 129)
  pdf.setFont('helvetica', 'bold')
  pdf.text(LABELS[lang].otherAssessments, ctx.margin, ctx.y)
  ctx.y += 10

  for (const idea of ideas) {
    // Ensure space for header box
    ensureSpace(ctx, 40)
    // Header box
    pdf.setFillColor(240, 253, 244)
    pdf.roundedRect(ctx.margin, ctx.y, ctx.contentWidth, 30, 3, 3, 'F')
    pdf.setFillColor(16, 185, 129)
    pdf.rect(ctx.margin, ctx.y, ctx.contentWidth, 5, 'F')

    pdf.setFontSize(FONT_SIZES.subtitle)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.text(idea.type, ctx.margin + 10, ctx.y + 18)

    pdf.setFontSize(FONT_SIZES.small)
    pdf.setFont('helvetica', 'normal')
    pdf.text(
      `${LABELS[lang].duration}: ${idea.duration}`,
      ctx.margin + ctx.contentWidth - 70,
      ctx.y + 18,
    )

    ctx.y += 35
    const descLines = wrapText(ctx, idea.description, ctx.contentWidth - 10)
    pdf.setFontSize(FONT_SIZES.standard)
    pdf.setFont('helvetica', 'normal')
    pdf.text(descLines, ctx.margin + 5, ctx.y)
    ctx.y += descLines.length * 6 + 10

    // Example questions (simplified)
    if (idea.exampleQuestions && idea.exampleQuestions.length > 0) {
      ensureSpace(ctx, 20)
      pdf.setFillColor(230, 250, 240)
      pdf.roundedRect(ctx.margin, ctx.y, ctx.contentWidth, 10, 2, 2, 'F')
      pdf.setFontSize(FONT_SIZES.subtitle)
      pdf.setTextColor(16, 185, 129)
      pdf.setFont('helvetica', 'bold')
      pdf.text(LABELS[lang].exampleQuestions, ctx.margin + ctx.contentWidth / 2, ctx.y + 7, {
        align: 'center',
      })
      ctx.y += 20

      for (let q = 0; q < idea.exampleQuestions.length; q++) {
        const question = idea.exampleQuestions[q]
        ensureSpace(ctx, 30)
        drawQuestionContainer(ctx, 10, {
          inset: 0,
          fill: [250, 250, 250],
          border: [220, 220, 220],
        })
        drawQuestionNumber(ctx, q, { xOffset: 15, yOffset: 15, color: [16, 185, 129] })

        pdf.setTextColor(0, 0, 0)
        pdf.setFontSize(FONT_SIZES.standard)
        pdf.setFont('helvetica', 'normal')
        const questionLines = wrapText(ctx, question.question, ctx.contentWidth - 50)
        pdf.text(questionLines, ctx.margin + 30, ctx.y + 15)
        ctx.y += Math.max(questionLines.length * 6 + 10, 30)

        if (question.correctAnswer) {
          ensureSpace(ctx, 20)
          pdf.setFillColor(230, 250, 240)
          pdf.roundedRect(ctx.margin + 20, ctx.y, ctx.contentWidth - 40, 10, 2, 2, 'F')
          pdf.setTextColor(0, 130, 0)
          pdf.setFontSize(FONT_SIZES.small)
          pdf.setFont('helvetica', 'bold')
          pdf.text(LABELS[lang].modelAnswer, ctx.margin + 30, ctx.y + 5)

          pdf.setTextColor(0, 0, 0)
          pdf.setFont('helvetica', 'normal')
          const answerLines = wrapText(ctx, question.correctAnswer, ctx.contentWidth - 100)
          pdf.text(answerLines, ctx.margin + 80, ctx.y + 5)
          ctx.y += Math.max(answerLines.length * 6, 15) + 5
        }

        // Criteria after each question if embedded in explanation object
        if (question.explanation && typeof question.explanation === 'object') {
          const maybe = question.explanation as {
            criteria?: Array<{ name?: string; weight?: number; description?: string }>
          }
          if (Array.isArray(maybe.criteria) && maybe.criteria.length > 0) {
            ctx.y += 5
            renderAssessmentCriteria(ctx, maybe.criteria, {
              headingColor: [16, 185, 129],
              stripeColor: [230, 250, 240],
            })
          }
        }

        ctx.y += 15
      }
    }

    ctx.y += 10
  }
}
