import type { SectionRenderer } from '../../types'
import { LABELS } from '../../labels'
import { addPageBreak, addSectionHeader, ensureSpace, wrapText } from '../../utils'
import { FONT_SIZES } from '../../constants'
import { drawQuestionContainer, drawQuestionNumber } from './helpers'

// Renders discussion-based assessment ideas (identified by type including 'discussion')
export const renderDiscussionAssessments: SectionRenderer = (ctx, content) => {
  const ideas = (content.assessmentIdeas || []).filter((i) =>
    i.type.toLowerCase().includes('discussion'),
  )
  if (ideas.length === 0) return
  const { pdf, lang } = ctx

  addPageBreak(ctx)
  addSectionHeader(ctx, LABELS[lang].discussionAssessments)

  for (const idea of ideas) {
    const descLines = wrapText(ctx, idea.description, ctx.contentWidth - 10)
    const descHeight = descLines.length * 6 + 5
    const exampleHeaderHeight = 15
    const descBoxHeight = 22 + descHeight + exampleHeaderHeight
    ensureSpace(ctx, descBoxHeight + 10)

    pdf.setFillColor(240, 249, 255)
    pdf.roundedRect(ctx.margin, ctx.y, ctx.contentWidth, descBoxHeight, 3, 3, 'F')
    pdf.setFillColor(14, 165, 233)
    pdf.rect(ctx.margin, ctx.y, ctx.contentWidth, 5, 'F')

    pdf.setFontSize(FONT_SIZES.subtitle)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.text(idea.type, ctx.margin + 10, ctx.y + 13)

    pdf.setFontSize(FONT_SIZES.small)
    pdf.setFont('helvetica', 'normal')
    pdf.text(
      `${LABELS[lang].duration}: ${idea.duration}`,
      ctx.margin + ctx.contentWidth - 70,
      ctx.y + 13,
    )

    pdf.setFontSize(FONT_SIZES.standard)
    pdf.setFont('helvetica', 'normal')
    pdf.text(descLines, ctx.margin + 10, ctx.y + 22)

    pdf.setFillColor(230, 240, 250)
    pdf.roundedRect(ctx.margin + 5, ctx.y + 22 + descHeight, ctx.contentWidth - 10, 10, 2, 2, 'F')
    pdf.setFontSize(FONT_SIZES.subtitle)
    pdf.setTextColor(14, 165, 233)
    pdf.setFont('helvetica', 'bold')
    pdf.text(
      LABELS[lang].discussionTopics,
      ctx.margin + ctx.contentWidth / 2,
      ctx.y + 22 + descHeight + 7,
      { align: 'center' },
    )

    ctx.y += descBoxHeight + 10

    if (idea.exampleQuestions && idea.exampleQuestions.length > 0) {
      for (let q = 0; q < idea.exampleQuestions.length; q++) {
        const question = idea.exampleQuestions[q]
        const questionWithMarks = question as typeof question & { markAllocation?: number }
        const questionLines = wrapText(ctx, question.question, ctx.contentWidth - 40)
        const questionHeight = Math.max(questionLines.length * 6 + 10, 30)

        let guidanceLines: string[] = []
        let guidanceHeight = 0
        if (question.correctAnswer) {
          guidanceLines = wrapText(ctx, question.correctAnswer, ctx.contentWidth - 40)
          guidanceHeight = Math.max(guidanceLines.length * 6, 15) + 8
        }

        let explanationLines: string[] = []
        let explanationHeight = 0
        const isExplanationString = question.explanation && typeof question.explanation === 'string'
        if (isExplanationString) {
          explanationLines = wrapText(ctx, question.explanation as string, ctx.contentWidth - 40)
          explanationHeight = explanationLines.length * 6 + 10
        }

        // Assessment Criteria Table (from explanation.criteria if object)
        interface CriteriaItem {
          name: string
          weight: number
        }
        let criteriaRows: { name: string; weight: string }[] = []
        let hasCriteria = false
        if (
          question.explanation &&
          typeof question.explanation === 'object' &&
          'criteria' in question.explanation &&
          Array.isArray(question.explanation.criteria)
        ) {
          hasCriteria = true
          const explanationObj = question.explanation as { criteria: CriteriaItem[] }
          criteriaRows = explanationObj.criteria.map((c) => ({
            name: c.name,
            weight: `${c.weight}%`,
          }))
        }

        // Point Allocation Table (from explanation.markAllocation if object)
        interface MarkAllocItem {
          component?: string
          section?: string
          marks?: number
          description?: string
        }
        let pointAllocRows: {
          key: string
          value: string
          description?: string
          descLines?: string[]
          rowHeight?: number
        }[] = []
        let hasPointAlloc = false

        // Check for markAllocation (ExplanationObject structure)
        if (
          question.explanation &&
          typeof question.explanation === 'object' &&
          'markAllocation' in question.explanation &&
          Array.isArray(question.explanation.markAllocation)
        ) {
          hasPointAlloc = true
          const explanationObj = question.explanation as { markAllocation: MarkAllocItem[] }
          pointAllocRows = explanationObj.markAllocation.map((allocation) => ({
            key: (allocation.component || allocation.section || LABELS[lang].component)
              .replace(/([A-Z])/g, ' $1')
              .trim()
              .replace(/^./, (str) => str.toUpperCase()),
            value: `${allocation.marks ?? 0} ${LABELS[lang].points}`,
            description: allocation.description,
          }))
        }
        // Fallback to pointAllocation (slide types structure) for backward compatibility
        else if (
          question.explanation &&
          typeof question.explanation === 'object' &&
          'pointAllocation' in question.explanation &&
          question.explanation.pointAllocation
        ) {
          hasPointAlloc = true
          const explanationObj = question.explanation as { pointAllocation: unknown }
          const pointAllocation = explanationObj.pointAllocation
          if (typeof pointAllocation === 'object' && pointAllocation !== null) {
            pointAllocRows = Object.entries(pointAllocation).map(([key, value]) => ({
              key: key
                .replace(/([A-Z])/g, ' $1')
                .trim()
                .replace(/^./, (str) => str.toUpperCase()),
              value: `${value} ${LABELS[lang].points}`,
            }))
          } else {
            pointAllocRows = [
              {
                key: LABELS[lang].points,
                value: `${String(pointAllocation)} ${LABELS[lang].points}`,
              },
            ]
          }
        }

        // Fallback for simple explanation
        let simpleExplanationHeight = 0
        let simpleExplanationLines: string[] = []
        if (question.explanation && !hasCriteria && !hasPointAlloc) {
          const explanationText =
            typeof question.explanation === 'string'
              ? question.explanation
              : JSON.stringify(question.explanation, null, 2)
          simpleExplanationLines = wrapText(ctx, explanationText, ctx.contentWidth - 40)
          simpleExplanationHeight = simpleExplanationLines.length * 6 + 10
        }

        // Table heights
        const tableRowHeight = 8
        const tableHeaderSpacing = 6
        const criteriaTableHeight = hasCriteria
          ? 10 + tableHeaderSpacing + criteriaRows.length * tableRowHeight
          : 0

        // Pre-compute wrapped lines and dynamic row heights for point allocation
        let pointAllocTableHeight = 0
        if (hasPointAlloc && pointAllocRows.length > 0) {
          pointAllocTableHeight = 10 + tableHeaderSpacing + 2
          const usableWidth = ctx.contentWidth - 40
          const pointsColWidth = Math.min(80, usableWidth * 0.5)
          const gap = 8
          const componentColWidth = usableWidth - pointsColWidth - gap

          for (let idx = 0; idx < pointAllocRows.length; idx++) {
            const row = pointAllocRows[idx]
            const compLines = wrapText(ctx, row.key, componentColWidth)
            const ptsText = `${String.fromCharCode(65 + idx)}. ${row.value}`
            const ptsLines = wrapText(ctx, ptsText, pointsColWidth)
            const baseHeight = Math.max(compLines.length, ptsLines.length) * 6
            row.descLines =
              row.description && row.description.trim().length > 0
                ? wrapText(ctx, row.description, usableWidth)
                : []
            const descLinesCount = row.descLines ? row.descLines.length : 0
            const descHeight = descLinesCount > 0 ? descLinesCount * 5 + 2 : 0
            row.rowHeight = baseHeight + descHeight + 3
            pointAllocTableHeight += row.rowHeight
          }
          pointAllocTableHeight += 5
        }

        // Simple numeric mark allocation (question level)
        const hasSimpleMarks =
          typeof questionWithMarks.markAllocation === 'number' &&
          questionWithMarks.markAllocation > 0

        // Calculate height for question card WITHOUT point allocation box
        const questionCardHeight =
          questionHeight +
          (guidanceHeight ? guidanceHeight + 5 : 0) +
          (hasCriteria ? criteriaTableHeight + 5 : 0) +
          (simpleExplanationHeight ? simpleExplanationHeight + 5 : 0) +
          20

        ensureSpace(ctx, questionCardHeight + 15)

        drawQuestionContainer(ctx, questionCardHeight, {
          inset: 0,
          fill: [250, 250, 250],
          border: [220, 220, 220],
        })
        drawQuestionNumber(ctx, q, { xOffset: 15, yOffset: 15, color: [14, 165, 233] })

        pdf.setTextColor(0, 0, 0)
        pdf.setFontSize(FONT_SIZES.standard)
        pdf.setFont('helvetica', 'normal')
        pdf.text(questionLines, ctx.margin + 30, ctx.y + 15)
        let innerY = ctx.y + 15 + questionLines.length * 6 + 5

        if (hasSimpleMarks) {
          pdf.setFontSize(FONT_SIZES.small)
          pdf.setFont('helvetica', 'italic')
          pdf.setTextColor(90, 90, 90)
          pdf.text(
            `${questionWithMarks.markAllocation} ${LABELS[lang].points || 'points'}`,
            ctx.margin + ctx.contentWidth - 80,
            ctx.y + 15,
          )
          pdf.setTextColor(0, 0, 0)
          pdf.setFont('helvetica', 'normal')
        }

        if (guidanceHeight) {
          pdf.setFillColor(230, 245, 255)
          pdf.roundedRect(ctx.margin + 10, innerY, ctx.contentWidth - 20, guidanceHeight, 2, 2, 'F')
          pdf.setTextColor(0, 100, 150)
          pdf.setFontSize(FONT_SIZES.small)
          pdf.setFont('helvetica', 'bold')
          pdf.text(LABELS[lang].discussionGuidance, ctx.margin + 20, innerY + 7)
          pdf.setTextColor(0, 0, 0)
          pdf.setFont('helvetica', 'normal')
          pdf.text(guidanceLines, ctx.margin + 20, innerY + 14, {
            maxWidth: ctx.contentWidth - 30,
          })
          innerY += guidanceHeight + 5
        }

        if (explanationHeight) {
          pdf.setFillColor(235, 245, 250)
          pdf.roundedRect(
            ctx.margin + 20,
            innerY,
            ctx.contentWidth - 40,
            explanationHeight,
            2,
            2,
            'F',
          )
          pdf.setTextColor(0, 100, 150)
          pdf.setFontSize(FONT_SIZES.small)
          pdf.setFont('helvetica', 'bold')
          pdf.text(LABELS[lang].explanation, ctx.margin + 30, innerY + 7)
          pdf.setTextColor(0, 0, 0)
          pdf.setFont('helvetica', 'normal')
          pdf.text(explanationLines, ctx.margin + 40, innerY + 14)
          innerY += simpleExplanationHeight + 5
        }

        // Render Assessment Criteria Table (if present)
        if (hasCriteria && criteriaRows.length > 0) {
          pdf.setFillColor(240, 248, 255)
          pdf.roundedRect(
            ctx.margin + 20,
            innerY,
            ctx.contentWidth - 40,
            criteriaTableHeight,
            2,
            2,
            'F',
          )
          pdf.setTextColor(14, 165, 233)
          pdf.setFontSize(FONT_SIZES.small)
          pdf.setFont('helvetica', 'bold')
          pdf.text(LABELS[lang].assessmentCriteria, ctx.margin + 30, innerY + 7)

          // Table header separator
          const tableY = innerY + 14
          pdf.setDrawColor(200, 200, 200)
          pdf.setLineWidth(0.5)
          pdf.line(ctx.margin + 30, tableY, ctx.margin + ctx.contentWidth - 50, tableY)

          // Render criteria rows
          let rowY = tableY + tableHeaderSpacing
          pdf.setTextColor(0, 0, 0)
          pdf.setFont('helvetica', 'normal')
          for (const row of criteriaRows) {
            pdf.text(row.name, ctx.margin + 35, rowY)
            pdf.text(row.weight, ctx.margin + ctx.contentWidth - 70, rowY)
            rowY += tableRowHeight
          }
          innerY += criteriaTableHeight + 5
        }

        ctx.y += questionCardHeight + 15

        // Render separate Point Allocation box below question card
        if (hasPointAlloc && pointAllocRows.length > 0) {
          const boxWidth = ctx.contentWidth - 20
          const boxX = ctx.margin + 10

          // Check if there's enough space on current page
          if (ctx.y + pointAllocTableHeight > ctx.pageHeight - ctx.margin) {
            pdf.addPage()
            ctx.y = ctx.margin
          }

          // Draw point allocation container
          pdf.setFillColor(255, 250, 235)
          pdf.roundedRect(boxX, ctx.y, boxWidth, pointAllocTableHeight, 2, 2, 'F')

          // Header
          pdf.setTextColor(150, 100, 0)
          pdf.setFontSize(FONT_SIZES.small)
          pdf.setFont('helvetica', 'bold')
          pdf.text(LABELS[lang].pointAllocation, boxX + 10, ctx.y + 7)

          // Table separator
          const headerY = ctx.y + 12
          pdf.setDrawColor(200, 200, 200)
          pdf.setLineWidth(0.5)
          pdf.line(boxX + 10, headerY, boxX + boxWidth - 10, headerY)

          // Column layout calculations (matching original)
          const usableWidth = boxWidth - 20
          const pointsColWidth = Math.min(80, usableWidth * 0.5)
          const gap = 8
          const componentColWidth = usableWidth - pointsColWidth - gap

          let tableY = headerY + 2
          pdf.setTextColor(0, 0, 0)
          pdf.setFont('helvetica', 'normal')

          for (let idx = 0; idx < pointAllocRows.length; idx++) {
            const row = pointAllocRows[idx]
            const startY = tableY

            // Component column
            const compLines = wrapText(ctx, row.key, componentColWidth)
            for (let i = 0; i < compLines.length; i++) {
              pdf.text(compLines[i], boxX + 15, startY + i * 6)
            }

            // Points column
            const ptsText = `${String.fromCharCode(65 + idx)}. ${row.value}`
            const ptsLines = wrapText(ctx, ptsText, pointsColWidth)
            for (let i = 0; i < ptsLines.length; i++) {
              pdf.text(ptsLines[i], boxX + 15 + componentColWidth + gap, startY + i * 6)
            }

            // Description under the row if present
            const baseRowHeight = Math.max(compLines.length, ptsLines.length) * 6
            if (row.descLines && row.descLines.length > 0) {
              const descY = startY + baseRowHeight + 2
              for (let i = 0; i < row.descLines.length; i++) {
                pdf.text(row.descLines[i], boxX + 15, descY + i * 5)
              }
            }

            tableY += row.rowHeight || baseRowHeight + 3
          }

          ctx.y += pointAllocTableHeight + 10
        }
      }
    }

    ctx.y += 10
  }
}
