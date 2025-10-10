import * as docx from 'docx'
import { Lang } from '@/lib/utils/lang'
import { getDocxLabels } from './labels'
import { processTextWithBold } from './text'

// Light-weight assessment shape we rely on
interface AssessmentForProject {
  type?: string
  duration?: string
  exampleQuestions: Array<{
    question: string
    correctAnswer?: string
    explanation?: unknown
  }>
}

export interface ProjectMetadata {
  courseCode?: string
  courseName?: string
  examTitle?: string
  semester?: string
  academicYear?: string
  deadline?: string
  groupSize?: number
  projectDuration?: string
}

// Build the project section (metadata + description) if assessment type appears to be a project/proyek
// Returns an ordered list of docx blocks (Paragraphs) ready to be appended to the document body.
export interface ProjectSectionResult {
  paragraphs: docx.Paragraph[]
  handledQuestions: boolean // indicates we embedded project description & guidelines so caller should skip generic questions
}

export function buildProjectSection(
  assessment: AssessmentForProject,
  metadata: ProjectMetadata | undefined,
  language: Lang,
  format: 'student' | 'lecturer' = 'lecturer',
): ProjectSectionResult {
  const labels = getDocxLabels(language)
  const isProjectType = /\b(project|proyek)\b/i.test(assessment.type || '')
  if (!isProjectType) return { paragraphs: [], handledQuestions: false }
  const paragraphs: docx.Paragraph[] = []

  const projectDescription = assessment.exampleQuestions?.[0]?.question || ''
  if (!projectDescription.trim()) return { paragraphs, handledQuestions: false }

  // Determine which metadata fields are already embedded in description to avoid duplication
  const containsSemester = !!metadata?.semester && projectDescription.includes(metadata.semester)
  const containsAcademicYear =
    !!metadata?.academicYear && projectDescription.includes(metadata.academicYear)
  const containsDeadline = !!metadata?.deadline && projectDescription.includes(metadata.deadline)
  const containsGroupSize =
    !!metadata?.groupSize &&
    new RegExp(`(group|kelompok).*?${metadata.groupSize}`, 'i').test(projectDescription)

  const isStudent = format === 'student'

  if (!isStudent) {
    // PROJECT INFORMATION heading (lecturer only)
    paragraphs.push(
      new docx.Paragraph({
        text: labels.projectInformation,
        heading: docx.HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 },
      }),
    )
  }

  // Conditional metadata paragraphs (mirror original spacing/styling)
  if (!isStudent && !containsSemester && metadata?.semester) {
    paragraphs.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({ text: `${labels.semester}: `, bold: true }),
          new docx.TextRun({ text: metadata.semester }),
        ],
        spacing: { after: 100 },
      }),
    )
  }

  if (!isStudent && !containsAcademicYear && metadata?.academicYear) {
    paragraphs.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({ text: `${labels.academicYear}: `, bold: true }),
          new docx.TextRun({ text: metadata.academicYear }),
        ],
        spacing: { after: 100 },
      }),
    )
  }

  if (!isStudent && !containsDeadline && metadata?.deadline) {
    paragraphs.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({ text: `${labels.submissionDeadline}: `, bold: true }),
          new docx.TextRun({ text: metadata.deadline }),
        ],
        spacing: { after: 100 },
      }),
    )
  }

  if (!isStudent && !containsGroupSize && metadata?.groupSize) {
    paragraphs.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({ text: `${labels.groupSize}: `, bold: true }),
          new docx.TextRun({ text: `${metadata.groupSize} ${labels.membersPerGroup}` }),
        ],
        spacing: { after: 100 },
      }),
    )
  }

  // Duration (always shown if available in metadata or assessment)
  if (!isStudent && (metadata?.projectDuration || assessment.duration)) {
    paragraphs.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({ text: `${labels.duration}: `, bold: true }),
          new docx.TextRun({ text: metadata?.projectDuration || assessment.duration || '' }),
        ],
        spacing: { after: 200 },
      }),
    )
  }

  // PROJECT DESCRIPTION heading
  paragraphs.push(
    new docx.Paragraph({
      text: labels.projectDescription,
      heading: docx.HeadingLevel.HEADING_3,
      spacing: { before: 400, after: 200 },
    }),
  )

  // Split description into logical parts (blank-line separated)
  const questionParts = projectDescription.split(/\n+/)
  let currentTitle = ''
  let currentContent: docx.Paragraph[] = []

  function flushSection() {
    if (currentContent.length === 0) return
    if (currentTitle) {
      paragraphs.push(
        new docx.Paragraph({
          text: currentTitle,
          heading: docx.HeadingLevel.HEADING_3,
          spacing: { before: 300, after: 200 },
        }),
      )
    }
    currentContent.forEach((p) => paragraphs.push(p))
    currentContent = []
  }

  function getIndentLevel(text: string) {
    const leadingWhitespace = text.match(/^[ \t]*/)?.[0] || ''
    const normalized = leadingWhitespace.replace(/\t/g, '    ')
    return Math.floor(normalized.length / 4)
  }

  questionParts.forEach((rawPart) => {
    const part = rawPart.trimEnd()
    const section = part.trim()
    if (!section) return

    const { hasBold, boldSegments } = processTextWithBold(section)

    const inlineHeaderContent = section.match(/^\*\*(.+?):\*\*\s*(.+)$/)
    const sectionTitleOnly = section.match(/^\*\*(.+)\*\*$/)
    const sectionTitleWithColon = section.match(/^\*\*(.+?):\*\*$/)
    const isBullet = /^[ \t]*([-*+•])\s/.test(section)
    const isNumbered = /^[ \t]*(\d+\.|[a-z]\.|[ivxlcdm]+\.|[IVXLCDM]+\.)\s/.test(section)

    // Header only lines -> start new stored section
    if (sectionTitleOnly || sectionTitleWithColon) {
      flushSection()
      currentTitle = (sectionTitleOnly?.[1] || sectionTitleWithColon?.[1] || '').trim()
      return
    }

    // Inline header pattern **Header:** content
    if (inlineHeaderContent) {
      const header = inlineHeaderContent[1].trim()
      const content = inlineHeaderContent[2].trim()
      currentContent.push(
        new docx.Paragraph({
          children: [
            new docx.TextRun({ text: `${header}: `, bold: true }),
            new docx.TextRun({ text: content }),
          ],
          spacing: { after: 100 },
        }),
      )
      return
    }

    if (isBullet || isNumbered) {
      const indentLevel = getIndentLevel(part)
      currentContent.push(
        new docx.Paragraph({
          children: hasBold
            ? boldSegments.map(
                (segment) => new docx.TextRun({ text: segment.text, bold: segment.bold }),
              )
            : [new docx.TextRun(section)],
          numbering: {
            reference: isBullet ? 'bulletPoints' : 'projectPoints',
            level: indentLevel,
          },
          spacing: { after: 100 },
        }),
      )
      return
    }

    // Regular paragraph
    currentContent.push(
      new docx.Paragraph({
        children: hasBold
          ? boldSegments.map(
              (segment) => new docx.TextRun({ text: segment.text, bold: segment.bold }),
            )
          : [new docx.TextRun(section)],
        spacing: { after: 200 },
      }),
    )
  })

  // Flush any remaining buffered section
  flushSection()

  // Enhanced guidelines/model answer sourcing (lecturer only)
  if (!isStudent && format === 'lecturer') {
    const guidelineBlocks: string[] = []
    const second = assessment.exampleQuestions[1]
    if (second?.question) guidelineBlocks.push(second.question)
    assessment.exampleQuestions.forEach((q, idx) => {
      if (q.correctAnswer) {
        const labelPrefix = assessment.exampleQuestions.length > 1 ? `Q${idx + 1} ` : ''
        guidelineBlocks.push(`${labelPrefix}${q.correctAnswer}`)
      }
    })
    assessment.exampleQuestions.forEach((q) => {
      if (typeof q.explanation === 'string') guidelineBlocks.push(q.explanation)
    })
    const combined = guidelineBlocks
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n\n')
    if (combined) {
      // Start guidelines on a new page for clarity
      paragraphs.push(
        new docx.Paragraph({
          children: [new docx.PageBreak()],
          spacing: { after: 0 },
        }),
        new docx.Paragraph({
          text: labels.modelAnswerGuidelines,
          heading: docx.HeadingLevel.HEADING_3,
          spacing: { before: 400, after: 200 },
        }),
      )
      const guidelineLines = combined.split(/\n/)
      let paragraphBuffer: string[] = []

      function flushBuffer() {
        if (paragraphBuffer.length === 0) return
        const text = paragraphBuffer.join(' ').trim()
        paragraphBuffer = []
        if (!text) return
        const { hasBold, boldSegments } = processTextWithBold(text)
        paragraphs.push(
          new docx.Paragraph({
            children: hasBold
              ? boldSegments.map((seg) => new docx.TextRun({ text: seg.text, bold: seg.bold }))
              : [new docx.TextRun(text)],
            spacing: { after: 200 },
          }),
        )
      }

      guidelineLines.forEach((raw) => {
        const line = raw.replace(/\r$/, '')
        const trimmed = line.trim()
        const isBlank = trimmed.length === 0
        const isBullet = /^[ \t]*([-*+•])\s+/.test(line)
        const isNumbered = /^[ \t]*(\d+\.|[a-z]\.|[ivxlcdm]+\.|[IVXLCDM]+\.)\s+/.test(line)

        if (isBlank) {
          flushBuffer()
          return
        }

        if (isBullet || isNumbered) {
          // Finish any pending paragraph before starting bullet
          flushBuffer()
          const content = line.replace(
            /^[ \t]*([-*+•]|\d+\.|[a-z]\.|[ivxlcdm]+\.|[IVXLCDM]+\.)\s+/,
            '',
          )
          const { hasBold, boldSegments } = processTextWithBold(content)
          paragraphs.push(
            new docx.Paragraph({
              children: hasBold
                ? boldSegments.map((seg) => new docx.TextRun({ text: seg.text, bold: seg.bold }))
                : [new docx.TextRun(content)],
              numbering: {
                reference: isBullet ? 'bulletPoints' : 'projectPoints',
                level: getIndentLevel(line),
              },
              spacing: { after: 100 },
            }),
          )
          return
        }

        // Accumulate regular paragraph lines until blank
        paragraphBuffer.push(trimmed)
      })

      // Final flush
      flushBuffer()
    }
  }

  // For student format: we only rendered the description; we still want to suppress generic questions
  return { paragraphs, handledQuestions: true }
}
