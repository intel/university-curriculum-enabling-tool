import * as docx from 'docx'
import { Lang } from '@/lib/utils/lang'
import { createDefaultRubricDescriptions } from '@/lib/assessment/rubric'
import {
  REPORT_PREFIXES,
  DEMO_PREFIXES,
  INDIVIDUAL_PREFIXES,
  removeAnyPrefix,
  isCriterionWithPrefix,
} from './prefixes'
import { getDocxLabels } from './labels'

// Local interfaces (expanded to satisfy lint rule requiring multiline)
interface Criterion {
  name: string
  weight: number
  description?: string
}
interface RubricLevel {
  level: string
  criteria: Record<string, string>
}

// Union type for blocks we append to the document content
export type DocxBlock = docx.Paragraph | docx.Table

function matchesLevel(
  level: string | undefined,
  target: 'excellent' | 'good' | 'average' | 'acceptable' | 'poor',
  language: Lang,
): boolean {
  if (!level) return false
  const l = level.toLowerCase()
  if (language === 'id') {
    if (target === 'excellent') return l.includes('sangat baik')
    if (target === 'good') return l.includes('baik') && !l.includes('sangat')
    if (target === 'average') return l.includes('sedang')
    if (target === 'acceptable') return l.includes('cukup')
    if (target === 'poor') return l.includes('sangat kurang') || l.includes('kurang')
  } else {
    if (target === 'excellent') return l.includes('excellent')
    if (target === 'good') return l.includes('good')
    if (target === 'average') return l.includes('average')
    if (target === 'acceptable') return l.includes('acceptable')
    if (target === 'poor') return l.includes('poor')
  }
  return false
}

// Unified per-criterion descriptor resolution mirroring PDF logic
function resolveCriterionDescriptions(
  criterion: Criterion,
  rubricLevels: RubricLevel[],
  language: Lang,
) {
  const rawName = criterion.name || ''
  // Remove any known prefix for display/base matching
  const displayAfterReportDemo = removeAnyPrefix(
    removeAnyPrefix(rawName, REPORT_PREFIXES),
    DEMO_PREFIXES,
  )
  const baseName = removeAnyPrefix(displayAfterReportDemo, INDIVIDUAL_PREFIXES)
  const defaults = createDefaultRubricDescriptions(baseName, language)
  let excellent = defaults.excellent
  let good = defaults.good
  let average = defaults.average
  let acceptable = defaults.acceptable
  let poor = defaults.poor

  if (Array.isArray(rubricLevels) && rubricLevels.length) {
    for (const level of rubricLevels) {
      if (!level || typeof level !== 'object') continue
      const criteriaMap = level.criteria || {}
      const keys = Object.keys(criteriaMap)
      // Accept matches on raw, base, or case-insensitive base
      const candidate = keys.find(
        (k) => k === rawName || k === baseName || k.toLowerCase() === baseName.toLowerCase(),
      )
      if (!candidate) continue
      const txt = criteriaMap[candidate]
      if (!txt) continue
      if (matchesLevel(level.level, 'excellent', language)) excellent = txt
      else if (matchesLevel(level.level, 'good', language)) good = txt
      else if (matchesLevel(level.level, 'average', language)) average = txt
      else if (matchesLevel(level.level, 'acceptable', language)) acceptable = txt
      else if (matchesLevel(level.level, 'poor', language)) poor = txt
    }
  }
  return { baseName, excellent, good, average, acceptable, poor }
}

function buildSectionTable(
  criteria: Criterion[],
  language: Lang,
  sectionLabel: string,
  prefixes: string[],
  rubricLevels: RubricLevel[],
): DocxBlock[] {
  const labels = getDocxLabels(language)
  if (criteria.length === 0) return []

  const heading = new docx.Paragraph({
    text: sectionLabel,
    heading: docx.HeadingLevel.HEADING_3,
    spacing: { before: 300, after: 200 },
  })

  const headerRow = new docx.TableRow({
    children: [
      new docx.TableCell({
        children: [new docx.Paragraph({ text: labels.criteria, style: 'strongText' })],
        width: { size: 20, type: docx.WidthType.PERCENTAGE },
      }),
      new docx.TableCell({
        children: [new docx.Paragraph({ text: labels.excellentHeader, style: 'strongText' })],
        width: { size: 16, type: docx.WidthType.PERCENTAGE },
      }),
      new docx.TableCell({
        children: [new docx.Paragraph({ text: labels.goodHeader, style: 'strongText' })],
        width: { size: 16, type: docx.WidthType.PERCENTAGE },
      }),
      new docx.TableCell({
        children: [new docx.Paragraph({ text: labels.averageHeader, style: 'strongText' })],
        width: { size: 16, type: docx.WidthType.PERCENTAGE },
      }),
      new docx.TableCell({
        children: [new docx.Paragraph({ text: labels.acceptableHeader, style: 'strongText' })],
        width: { size: 16, type: docx.WidthType.PERCENTAGE },
      }),
      new docx.TableCell({
        children: [new docx.Paragraph({ text: labels.poorHeader, style: 'strongText' })],
        width: { size: 16, type: docx.WidthType.PERCENTAGE },
      }),
    ],
  })

  const rows = criteria.map((criterion) => {
    const { baseName, excellent, good, average, acceptable, poor } = resolveCriterionDescriptions(
      criterion,
      rubricLevels,
      language,
    )
    const weightSuffix = criterion.weight ? ` (${criterion.weight}%)` : ''
    return new docx.TableRow({
      children: [
        new docx.TableCell({
          children: [
            new docx.Paragraph({ text: baseName + weightSuffix, style: 'strongText' }),
            criterion.description
              ? new docx.Paragraph({ text: criterion.description, style: 'criteriaDescription' })
              : new docx.Paragraph(''),
          ],
        }),
        new docx.TableCell({
          children: [new docx.Paragraph(excellent || labels.excellentDefault)],
        }),
        new docx.TableCell({
          children: [new docx.Paragraph(good || labels.goodDefault)],
        }),
        new docx.TableCell({
          children: [new docx.Paragraph(average || labels.averageDefault)],
        }),
        new docx.TableCell({
          children: [new docx.Paragraph(acceptable || labels.acceptableDefault)],
        }),
        new docx.TableCell({
          children: [new docx.Paragraph(poor || labels.poorDefault)],
        }),
      ],
    })
  })

  const table = new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    rows: [headerRow, ...rows],
  })
  return [heading, table, new docx.Paragraph({ text: '' })]
}

export function buildRubricTables(
  allCriteria: unknown[],
  rubricLevels: RubricLevel[],
  language: Lang,
): DocxBlock[] {
  const reportCriteria = allCriteria.filter((c) =>
    isCriterionWithPrefix<Criterion>(c, REPORT_PREFIXES),
  ) as Criterion[]
  const demoCriteria = allCriteria.filter((c) =>
    isCriterionWithPrefix<Criterion>(c, DEMO_PREFIXES),
  ) as Criterion[]
  const individualCriteria = allCriteria.filter((c) =>
    isCriterionWithPrefix<Criterion>(c, INDIVIDUAL_PREFIXES),
  ) as Criterion[]
  const labels = getDocxLabels(language)
  const out: DocxBlock[] = []
  out.push(
    ...buildSectionTable(
      reportCriteria,
      language,
      labels.reportSection,
      REPORT_PREFIXES,
      rubricLevels,
    ),
    ...buildSectionTable(demoCriteria, language, labels.demoSection, DEMO_PREFIXES, rubricLevels),
    ...buildSectionTable(
      individualCriteria,
      language,
      labels.individualSection,
      INDIVIDUAL_PREFIXES,
      rubricLevels,
    ),
  )
  return out
}

export function buildDefaultRubric(
  criteriaNames: { name: string; weight: number; description?: string }[],
  language: Lang,
): docx.Table {
  const labels = getDocxLabels(language)
  const rows = criteriaNames.map((criterion) => {
    const { baseName, excellent, good, average, acceptable, poor } = resolveCriterionDescriptions(
      { name: criterion.name, weight: criterion.weight, description: criterion.description },
      [],
      language,
    )
    const defaults = createDefaultRubricDescriptions(baseName, language)
    return new docx.TableRow({
      children: [
        new docx.TableCell({
          children: [
            new docx.Paragraph({
              text: baseName + (criterion.weight ? ` (${criterion.weight}%)` : ''),
              style: 'strongText',
            }),
            criterion.description
              ? new docx.Paragraph({ text: criterion.description, style: 'criteriaDescription' })
              : new docx.Paragraph(''),
          ],
        }),
        new docx.TableCell({ children: [new docx.Paragraph(excellent || defaults.excellent)] }),
        new docx.TableCell({ children: [new docx.Paragraph(good || defaults.good)] }),
        new docx.TableCell({ children: [new docx.Paragraph(average || defaults.average)] }),
        new docx.TableCell({ children: [new docx.Paragraph(acceptable || defaults.acceptable)] }),
        new docx.TableCell({ children: [new docx.Paragraph(poor || defaults.poor)] }),
      ],
    })
  })
  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    rows: [
      new docx.TableRow({
        children: [
          new docx.TableCell({
            children: [new docx.Paragraph({ text: labels.criteria, style: 'strongText' })],
          }),
          new docx.TableCell({
            children: [new docx.Paragraph({ text: labels.excellentHeader, style: 'strongText' })],
          }),
          new docx.TableCell({
            children: [new docx.Paragraph({ text: labels.goodHeader, style: 'strongText' })],
          }),
          new docx.TableCell({
            children: [new docx.Paragraph({ text: labels.averageHeader, style: 'strongText' })],
          }),
          new docx.TableCell({
            children: [new docx.Paragraph({ text: labels.acceptableHeader, style: 'strongText' })],
          }),
          new docx.TableCell({
            children: [new docx.Paragraph({ text: labels.poorHeader, style: 'strongText' })],
          }),
        ],
      }),
      ...rows,
    ],
  })
}
