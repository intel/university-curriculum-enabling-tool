import * as docx from 'docx'
import { Lang } from '@/lib/utils/lang'
import { getDocxLabels } from './labels'
import { buildRubricTables, buildDefaultRubric, DocxBlock } from './rubricTables'

interface CriterionLike {
  name: string
  weight: number
  description?: string
}
interface RubricLevel {
  level: string
  criteria: Record<string, string>
}

export interface RubricsSectionOptions {
  language: Lang
  format: 'student' | 'lecturer'
  criteria: CriterionLike[]
  rubricLevels?: RubricLevel[]
  // If true, force showing even for student (feature parity decision: default false)
  forceForStudent?: boolean
}

export function buildRubricsSection(opts: RubricsSectionOptions): DocxBlock[] {
  const { language, format, criteria, rubricLevels, forceForStudent } = opts
  const labels = getDocxLabels(language)
  const isLecturer = format === 'lecturer'
  if (!isLecturer && !forceForStudent) return []

  const blocks: DocxBlock[] = []

  // Start rubrics on a new page for clarity (legacy parity requirement)
  blocks.push(
    new docx.Paragraph({
      children: [new docx.PageBreak()],
      spacing: { after: 0 },
    }),
  )

  // Heading & grading scale
  blocks.push(
    new docx.Paragraph({
      text: labels.rubricTitle,
      heading: docx.HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
    }),
    new docx.Paragraph({
      text: labels.gradingScale,
      style: 'gradingScale',
      spacing: { after: 300 },
    }),
  )

  // Grouped tables logic: if rubricLevels present & criteria names carry category prefixes
  if (Array.isArray(rubricLevels) && rubricLevels.length > 0) {
    blocks.push(...buildRubricTables(criteria, rubricLevels, language))
  }

  // Fallback default rubric if nothing produced (e.g., no level mapping or no prefixed criteria)
  const producedHasTable = blocks.some((b) => b instanceof docx.Table)
  if (!producedHasTable && criteria.length > 0) {
    blocks.push(buildDefaultRubric(criteria, language))
  }

  return blocks
}
