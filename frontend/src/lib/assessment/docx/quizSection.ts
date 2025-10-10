import * as docx from 'docx'
import { Lang } from '@/lib/utils/lang'
import { getDocxLabels } from './labels'

interface AssessmentForQuiz {
  type?: string
}

export function buildQuizSection(assessment: AssessmentForQuiz, language: Lang): docx.Paragraph[] {
  const labels = getDocxLabels(language)
  const isQuiz = /\b(quiz|kuis)\b/i.test(assessment.type || '')
  if (!isQuiz) return []
  return [
    new docx.Paragraph({
      text: labels.quizInstruction,
      spacing: { before: 300, after: 300 },
    }),
    new docx.Paragraph({
      children: [
        new docx.TextRun({ text: labels.studentName + ': ', bold: true }),
        new docx.TextRun({ text: '______________________________' }),
      ],
      spacing: { after: 200 },
    }),
    new docx.Paragraph({
      children: [
        new docx.TextRun({ text: labels.dateLabel + ': ', bold: true }),
        new docx.TextRun({ text: '______________________________' }),
      ],
      spacing: { after: 400 },
    }),
  ]
}
