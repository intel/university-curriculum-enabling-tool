import * as docx from 'docx'
import { Lang } from '@/lib/utils/lang'
import { paragraphStyles, numberingConfig } from './documentStyles'
import { getDocxLabels } from './labels'
import { buildProjectSection, ProjectMetadata, ProjectSectionResult } from './projectSection'
import { buildQuizSection } from './quizSection'
import { buildQuestionsSection } from './questionsSection'
import { buildRubricsSection } from './rubricsSection'

// Keep same content shape expected by existing route caller
export interface AssessmentIdea {
  type?: string
  duration?: string
  exampleQuestions: Array<{
    question: string
    correctAnswer?: string
    explanation?: unknown
    markAllocation?: number
  }>
}

export interface AssessmentDocxContent {
  assessmentIdeas: AssessmentIdea[]
  difficultyLevel?: string
  format?: 'student' | 'lecturer'
  metadata?: ProjectMetadata & {
    courseCode?: string
    courseName?: string
    examTitle?: string
  }
}

function localizeTitle(rawTitle: string, language: Lang): string {
  if (language !== 'id' || !rawTitle) return rawTitle
  const map: Array<[RegExp, string]> = [
    [/assessment/gi, 'Penilaian'],
    [/project/gi, 'Proyek'],
    [/exam/gi, 'Ujian'],
    [/quiz/gi, 'Kuis'],
    [/assignment/gi, 'Tugas'],
    [/test/gi, 'Tes'],
    [/discussion/gi, 'Diskusi'],
  ]
  let title = rawTitle
  for (const [regex, replacement] of map) title = title.replace(regex, replacement)
  return title
}

export async function generateAssessmentDocx(
  content: AssessmentDocxContent,
  language: Lang = 'en',
): Promise<Buffer> {
  const assessment = content.assessmentIdeas[0]
  const format = content.format || 'lecturer'
  const metadata = content.metadata || {
    courseCode: '',
    courseName: '',
    examTitle: language === 'id' ? `${assessment.type} Penilaian` : `${assessment.type} Assessment`,
  }
  getDocxLabels(language) // ensure localization side-effects (future use)
  const isProject = /\b(project|proyek)\b/i.test(assessment.type || '')
  const isQuiz = /\b(quiz|kuis)\b/i.test(assessment.type || '')

  const children: (docx.Paragraph | docx.Table)[] = []

  // Header (empty per original implementation removing SULIT/CONFIDENTIAL)
  const header = new docx.Header({ children: [] })
  const footer = new docx.Footer({
    children: [
      new docx.Paragraph({
        children: [new docx.TextRun({ children: [docx.PageNumber.CURRENT] })],
        alignment: docx.AlignmentType.CENTER,
        style: 'footer',
      }),
    ],
  })

  const rawTitle = metadata.examTitle || assessment.type + ' Assessment'
  const title = localizeTitle(rawTitle, language)
  children.push(
    new docx.Paragraph({
      text: title,
      alignment: docx.AlignmentType.CENTER,
      spacing: { after: 200 },
      heading: docx.HeadingLevel.HEADING_1,
    }),
  )
  if (metadata.courseCode || metadata.courseName) {
    children.push(
      new docx.Paragraph({
        text: `${metadata.courseCode || ''} – ${metadata.courseName || ''}`,
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 400 },
        heading: docx.HeadingLevel.HEADING_2,
      }),
    )
  }

  // Project or Quiz section (mutually exclusive in effect)
  let projectHandled = false
  if (isProject) {
    const project: ProjectSectionResult = buildProjectSection(
      assessment,
      metadata,
      language,
      format,
    )
    children.push(...project.paragraphs)
    projectHandled = project.handledQuestions
  } else if (isQuiz) {
    children.push(...buildQuizSection(assessment, language))
  }

  // Questions section: skip entirely for project if projectHandled (both lecturer and student) to avoid duplicate description
  if (!(isProject && projectHandled)) {
    children.push(...buildQuestionsSection(assessment, { format, language }))
  }

  // Rubrics (lecturer only)
  // Extract criteria & rubricLevels from first explanation if structured
  interface CriteriaItem {
    name: string
    weight: number
    description?: string
  }
  interface RubricLevel {
    level: string
    criteria: Record<string, string>
  }
  let criteria: CriteriaItem[] = []
  let rubricLevels: RubricLevel[] = []
  const first = assessment.exampleQuestions[0]
  if (first?.explanation && typeof first.explanation === 'object') {
    const exp = first.explanation as {
      criteria?: CriteriaItem[]
      rubricLevels?: RubricLevel[]
    }
    if (Array.isArray(exp.criteria)) criteria = exp.criteria as CriteriaItem[]
    if (Array.isArray(exp.rubricLevels)) rubricLevels = exp.rubricLevels as RubricLevel[]
  }
  children.push(
    ...buildRubricsSection({
      language,
      format,
      criteria,
      rubricLevels,
    }),
  )

  // Document creation
  const doc = new docx.Document({
    styles: { paragraphStyles },
    numbering: { config: numberingConfig },
    sections: [
      {
        headers: { default: header },
        footers: { default: footer },
        children,
      },
    ],
  })

  const buffer = await docx.Packer.toBuffer(doc)
  return buffer
}
