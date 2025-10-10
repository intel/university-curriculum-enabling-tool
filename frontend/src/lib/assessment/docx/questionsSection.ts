import * as docx from 'docx'
import { Lang } from '@/lib/utils/lang'
import { getDocxLabels } from './labels'
import { processTextWithBold } from './text'

interface ExampleQuestion {
  question: string
  correctAnswer?: string
  explanation?: unknown
  markAllocation?: number
}

interface AssessmentForQuestions {
  exampleQuestions: ExampleQuestion[]
  type?: string
}

export interface QuestionsSectionOptions {
  format: 'student' | 'lecturer'
  language: Lang
  includeModelAnswers?: boolean // defaults: lecturer only
}

// Flatten possible JSON-wrapped model answers (common cleanup in original route)
interface MaybeAnswerJSON {
  answer?: unknown
  modelAnswer?: unknown
  [k: string]: unknown
}

function cleanModelAnswer(raw: string): string {
  try {
    const obj: MaybeAnswerJSON = JSON.parse(raw)
    if (obj && typeof obj === 'object') {
      if (typeof obj.answer === 'string') return obj.answer
      if (typeof obj.modelAnswer === 'string') return obj.modelAnswer
    }
  } catch {
    /* silent */
  }
  return raw
}

function renderRichParagraph(text: string): docx.Paragraph[] {
  // Split by blank lines -> separate paragraphs
  const parts = text.split(/\n{2,}/)
  const out: docx.Paragraph[] = []
  parts.forEach((block) => {
    const lines = block.split(/\n/)
    lines.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      const { hasBold, boldSegments } = processTextWithBold(trimmed)
      const isBullet = /^[ \t]*([-*+•])\s/.test(trimmed)
      const isNumbered = /^[ \t]*(\d+\.|[a-z]\.|[ivxlcdm]+\.|[IVXLCDM]+\.)\s/.test(trimmed)
      const children = hasBold
        ? boldSegments.map((seg) => new docx.TextRun({ text: seg.text, bold: seg.bold }))
        : [new docx.TextRun(trimmed)]
      if (isBullet || isNumbered) {
        out.push(
          new docx.Paragraph({
            children,
            numbering: { reference: isBullet ? 'bulletPoints' : 'projectPoints', level: 0 },
            spacing: { after: 100 },
          }),
        )
      } else {
        out.push(
          new docx.Paragraph({
            children,
            spacing: { after: 150 },
          }),
        )
      }
    })
  })
  return out
}

export function buildQuestionsSection(
  assessment: AssessmentForQuestions,
  opts: QuestionsSectionOptions,
): docx.Paragraph[] {
  const { format, language } = opts
  const labels = getDocxLabels(language)
  const isStudent = format === 'student'
  const out: docx.Paragraph[] = []

  const questions = assessment.exampleQuestions || []
  if (!questions.length) return out

  // Instruction line referencing number of questions
  out.push(
    new docx.Paragraph({
      text: `${labels.instructions2Prefix} ${questions.length} ${labels.questions}.`,
      spacing: { before: 400, after: 300 },
    }),
  )

  questions.forEach((q, index) => {
    // Ensure each question starts on a new page (add break before questions 2..n)
    if (index > 0) {
      out.push(
        new docx.Paragraph({
          children: [new docx.PageBreak()],
          spacing: { after: 0 },
        }),
      )
    }
    const numberPrefix = `${index + 1}. `
    const questionText = q.question || ''

    // First line (question heading + maybe marks)
    const hasMarks = typeof q.markAllocation === 'number' && q.markAllocation > 0
    out.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({ text: numberPrefix, bold: true }),
          new docx.TextRun({ text: questionText }),
          hasMarks
            ? new docx.TextRun({
                text: ` (${q.markAllocation} ${labels.markAllocation || 'marks'})`,
              })
            : new docx.TextRun(''),
        ],
        spacing: { after: 150 },
      }),
    )

    // Lecturer-only model answer/explanation logic
    if (!isStudent) {
      // Model answer (correctAnswer)
      if (q.correctAnswer) {
        const cleaned = cleanModelAnswer(q.correctAnswer)
        out.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: labels.modelAnswer + ': ', bold: true }),
              new docx.TextRun({ text: cleaned }),
            ],
            spacing: { after: 120 },
          }),
        )
      }

      // Explanation object/string (similar to large route handling, simplified)
      if (q.explanation) {
        out.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: labels.markingCriteria + ':', bold: true })],
            spacing: { before: 150, after: 120 },
          }),
        )

        if (typeof q.explanation === 'string') {
          renderRichParagraph(q.explanation).forEach((p) => out.push(p))
        } else if (typeof q.explanation === 'object' && q.explanation) {
          interface CriteriaItem {
            name?: string
            weight?: number
            description?: string
          }
          interface MarkAllocItem {
            section?: string
            component?: string
            marks?: number
            description?: string
          }
          interface ExplanationShape {
            criteria?: CriteriaItem[]
            markAllocation?: MarkAllocItem[]
          }
          const exp = q.explanation as ExplanationShape

          if (Array.isArray(exp.criteria) && exp.criteria.length > 0) {
            exp.criteria.forEach((c) => {
              if (!c || typeof c !== 'object') return
              const line = [c.name, c.weight ? `(${c.weight}%)` : ''].filter(Boolean).join(' ')
              out.push(
                new docx.Paragraph({
                  children: [new docx.TextRun({ text: line, bold: true })],
                  spacing: { after: 80 },
                }),
              )
              if (c.description) {
                renderRichParagraph(String(c.description)).forEach((p) => out.push(p))
              }
            })
          }

          if (Array.isArray(exp.markAllocation) && exp.markAllocation.length > 0) {
            out.push(
              new docx.Paragraph({
                children: [new docx.TextRun({ text: labels.markAllocation + ':', bold: true })],
                spacing: { before: 200, after: 140 },
              }),
            )
            exp.markAllocation.forEach((m) => {
              if (!m || typeof m !== 'object') return
              const name =
                (m.component && String(m.component)) ||
                (m.section && String(m.section)) ||
                (language === 'id' ? 'Komponen' : 'Component')
              const marksText = ` (${m.marks || 0} ${language === 'id' ? 'markah' : 'marks'})`
              out.push(
                new docx.Paragraph({
                  children: [
                    new docx.TextRun({ text: name, bold: true }),
                    new docx.TextRun({ text: marksText }),
                  ],
                  spacing: { after: m.description ? 60 : 140 },
                }),
              )
              if (m.description) {
                // Re-render description text lines with indentation preserving blank line separation
                const descLines = String(m.description).split(/\n{2,}/)
                descLines.forEach((block, idx, arr) => {
                  out.push(
                    new docx.Paragraph({
                      children: [new docx.TextRun({ text: block.trim() })],
                      indent: { left: 720 },
                      spacing: { after: idx === arr.length - 1 ? 140 : 80 },
                    }),
                  )
                })
              }
            })
          }
        }
      }
    }

    // No trailing blank spacing needed now; page break handles separation.
  })

  return out
}
