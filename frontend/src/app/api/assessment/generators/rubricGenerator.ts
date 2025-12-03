// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { generateText, generateObject, type ModelMessage } from 'ai'
import { z } from 'zod'
import type { ProviderFn } from '../types/assessment.types'
import type { ProjectRubric, ProjectRubricCriterion } from '@/lib/types/project-rubric-criterion'
import type { CourseInfo } from '@/lib/types/course-info-types'
import { TEMPERATURE, TOKEN_RESPONSE_BUDGET, langDirective } from '../config/constants'
import { extractJsonFromText } from '../utils/jsonHelpers'
import { stripThinkTags, logAssessmentDebug } from '../utils/generalHelpers'
import { needLanguageEnforcementForCriteria, enforceRubricLanguage } from '../utils/languageHelpers'

// Zod schema for project rubric criterion (inline for OVMS compatibility)
const projectRubricCriterionSchema = z.object({
  name: z.string(),
  weight: z.number(),
  description: z.string().optional(),
  levels: z
    .object({
      excellent: z.string(),
      good: z.string(),
      average: z.string(),
      acceptable: z.string(),
      poor: z.string(),
    })
    .optional(),
})

// Matches bullet/numbered criterion lines that optionally include a weight in parentheses.
// Capture groups:
//   1. Criterion name
//   2. Optional numeric weight (without % symbol)
//   3. Optional trailing description after ':' or '-'
const CRITERION_WITH_WEIGHT_REGEX =
  /^(?:\d+\.|\*|-)\s*(.*?)\s*(?:\((\d+)\s*%?\))?\s*(?::|-)?\s*(.*)$/i

// Matches bullet/numbered criterion lines with only the criterion name and no weight/description.
const CRITERION_BASIC_REGEX = /^(?:\d+\.|\*|-)\s*(.*)$/i

const matchCriterionLine = (line: string) =>
  line.match(CRITERION_WITH_WEIGHT_REGEX) || line.match(CRITERION_BASIC_REGEX)

// Helper function to get default level descriptions
export function getDefaultLevels(language: 'en' | 'id'): {
  excellent: string
  good: string
  average: string
  acceptable: string
  poor: string
} {
  return language === 'id'
    ? {
        excellent: 'Menunjukkan pemahaman yang luar biasa dan penerapan yang sangat baik',
        good: 'Menunjukkan pemahaman yang baik dan penerapan yang tepat',
        average: 'Menunjukkan pemahaman yang memadai dengan beberapa kekurangan',
        acceptable: 'Menunjukkan pemahaman dasar dengan kekurangan yang jelas',
        poor: 'Menunjukkan pemahaman yang terbatas atau tidak memadai',
      }
    : {
        excellent: 'Demonstrates exceptional understanding and excellent application',
        good: 'Shows good understanding and appropriate application',
        average: 'Shows adequate understanding with some shortcomings',
        acceptable: 'Shows basic understanding with clear deficiencies',
        poor: 'Shows limited or inadequate understanding',
      }
}

// Define the default project rubric with a language-aware structure (English default)
export const getDefaultProjectRubric = (language: 'en' | 'id' = 'en'): ProjectRubric => {
  if (language === 'id') {
    return {
      categories: {
        report: [
          {
            name: 'Konten dan Organisasi',
            weight: 20,
            description: 'Kejelasan, struktur, dan alur logis laporan.',
            levels: {
              excellent:
                'Organisasi sangat baik dengan alur jelas dan logis; transisi antar bagian mulus dan konsisten.',
              good: 'Organisasi baik dengan alur cukup jelas; sebagian besar transisi efektif dan relevan.',
              average:
                'Organisasi cukup, tetapi beberapa bagian kurang jelas atau tidak terhubung kuat.',
              acceptable:
                'Organisasi lemah; alur sulit diikuti dan beberapa bagian tampak tidak terstruktur.',
              poor: 'Tidak ada struktur organisasi yang jelas.',
            },
          },
          {
            name: 'Ketepatan Teknis',
            weight: 20,
            description: 'Ketepatan dan kedalaman informasi teknis yang disajikan.',
            levels: {
              excellent:
                'Menunjukkan pemahaman teknis sangat mendalam dan akurat tanpa kesalahan berarti.',
              good: 'Menunjukkan pemahaman teknis baik dengan hanya sedikit ketidakakuratan minor.',
              average:
                'Pemahaman teknis cukup namun terdapat beberapa ketidakakuratan atau bagian dangkal.',
              acceptable: 'Pemahaman teknis lemah; banyak kesalahan atau penjelasan dangkal.',
              poor: 'Tidak menunjukkan pemahaman teknis yang memadai.',
            },
          },
          {
            name: 'Analisis dan Interpretasi Data',
            weight: 15,
            description: 'Kualitas analisis data dan kekuatan interpretasi hasil.',
            levels: {
              excellent: 'Analisis mendalam, wawasan kuat, interpretasi didukung bukti relevan.',
              good: 'Analisis baik dengan interpretasi wajar dan sebagian besar didukung data.',
              average: 'Analisis dasar; interpretasi sebagian benar tetapi kurang kedalaman.',
              acceptable: 'Analisis minim; interpretasi lemah atau tidak didukung bukti cukup.',
              poor: 'Tidak ada analisis atau interpretasi yang bermakna.',
            },
          },
        ],
        demo: [
          {
            name: 'Kejelasan Presentasi',
            weight: 10,
            description: 'Kejelasan dan efektivitas penyampaian presentasi.',
            levels: {
              excellent:
                'Presentasi sangat jelas, terstruktur, menarik, dan mudah dipahami audiens.',
              good: 'Presentasi jelas dan umumnya mudah dipahami.',
              average: 'Presentasi cukup jelas namun kurang menarik atau kurang fokus.',
              acceptable: 'Presentasi sulit dipahami; struktur tidak konsisten.',
              poor: 'Tidak ada presentasi yang layak atau tidak disampaikan.',
            },
          },
          {
            name: 'Demonstrasi Teknis',
            weight: 10,
            description: 'Kualitas dan fungsionalitas demonstrasi teknis.',
            levels: {
              excellent:
                'Seluruh fitur/komponen utama berfungsi optimal dan ditunjukkan dengan jelas.',
              good: 'Sebagian besar fitur utama berfungsi dengan baik; beberapa aspek minor kurang optimal.',
              average: 'Hanya sebagian fitur berfungsi; ada beberapa masalah teknis.',
              acceptable: 'Demonstrasi tidak lengkap atau sering gagal saat ditunjukkan.',
              poor: 'Tidak ada demonstrasi teknis yang fungsional.',
            },
          },
        ],
        individual: [
          {
            name: 'Kontribusi Individu',
            weight: 15,
            description: 'Upaya dan kontribusi anggota terhadap proyek.',
            levels: {
              excellent: 'Kontribusi luar biasa, proaktif, konsisten, dan bernilai tinggi.',
              good: 'Kontribusi signifikan dan konsisten dengan kualitas baik.',
              average: 'Kontribusi cukup; beberapa bagian dikerjakan tetapi tidak menonjol.',
              acceptable: 'Kontribusi minimal; peran kurang jelas atau tidak konsisten.',
              poor: 'Tidak tampak kontribusi nyata terhadap proyek.',
            },
          },
        ],
      },
      markingScale:
        'Skala Penilaian: 1 - Sangat Kurang, 2 - Cukup, 3 - Sedang, 4 - Baik, 5 - Sangat Baik.',
      totalMarks: 100,
      reportWeight: 55,
      demoWeight: 30,
      individualWeight: 15,
    }
  }

  // English default
  return {
    categories: {
      report: [
        {
          name: 'Content and Organization',
          weight: 20,
          description: 'Clarity, structure, and logical flow of the report.',
          levels: {
            excellent:
              'Exceptional organization with clear, logical flow; smooth and consistent transitions between sections.',
            good: 'Good organization with mostly clear flow; most transitions are effective and relevant.',
            average: 'Adequate organization, though some sections are unclear or weakly connected.',
            acceptable: 'Weak organization; difficult to follow with some unstructured parts.',
            poor: 'No clear organizational structure.',
          },
        },
        {
          name: 'Technical Accuracy',
          weight: 20,
          description: 'Accuracy and depth of the technical information presented.',
          levels: {
            excellent:
              'Demonstrates very deep and accurate technical understanding with no significant errors.',
            good: 'Demonstrates good technical understanding with only minor inaccuracies.',
            average: 'Adequate technical understanding with some inaccuracies or shallow sections.',
            acceptable: 'Weak technical understanding; many errors or shallow explanations.',
            poor: 'Does not demonstrate sufficient technical understanding.',
          },
        },
        {
          name: 'Data Analysis and Interpretation',
          weight: 15,
          description: 'Quality of data analysis and strength of interpretation of results.',
          levels: {
            excellent:
              'In-depth analysis with strong insights; interpretations supported by relevant evidence.',
            good: 'Good analysis with reasonable interpretations mostly supported by data.',
            average: 'Basic analysis; interpretations partially correct but lacking depth.',
            acceptable: 'Minimal analysis; weak or insufficiently supported interpretations.',
            poor: 'No meaningful analysis or interpretation.',
          },
        },
      ],
      demo: [
        {
          name: 'Presentation Clarity',
          weight: 10,
          description: 'Clarity and effectiveness of the presentation delivery.',
          levels: {
            excellent:
              'Very clear, well-structured, engaging, and easy to understand for the audience.',
            good: 'Clear presentation and generally easy to understand.',
            average: 'Adequately clear but may lack engagement or focus.',
            acceptable: 'Hard to understand; inconsistent structure.',
            poor: 'No satisfactory presentation or not delivered.',
          },
        },
        {
          name: 'Technical Demonstration',
          weight: 10,
          description: 'Quality and functionality of the technical demonstration.',
          levels: {
            excellent:
              'All key features/components function optimally and are clearly demonstrated.',
            good: 'Most key features function well; some minor aspects are suboptimal.',
            average: 'Only some features work; several technical issues present.',
            acceptable: 'Incomplete demonstration or frequent failures during demonstration.',
            poor: 'No functional technical demonstration.',
          },
        },
      ],
      individual: [
        {
          name: 'Individual Contribution',
          weight: 15,
          description: 'Effort and contributions of members to the project.',
          levels: {
            excellent: 'Outstanding, proactive, consistent, and high-value contributions.',
            good: 'Significant and consistent contributions of good quality.',
            average: 'Adequate contributions; some parts completed but not standout.',
            acceptable: 'Minimal contributions; unclear or inconsistent role.',
            poor: 'No evident contribution to the project.',
          },
        },
      ],
    },
    markingScale: 'Grading Scale: 1 - Poor, 2 - Acceptable, 3 - Average, 4 - Good, 5 - Excellent.',
    totalMarks: 100,
    reportWeight: 55,
    demoWeight: 30,
    individualWeight: 15,
  }
}

// Helper function to manually extract criteria from text when JSON parsing fails
export function extractCriteriaFromText(
  text: string,
  language: 'en' | 'id',
): ProjectRubricCriterion[] {
  const criteria: ProjectRubricCriterion[] = []
  const lines = text.split('\n')
  let current: {
    name: string
    weight?: number
    descriptionParts: string[]
  } | null = null

  const flushCurrent = () => {
    if (!current || !current.name) return
    const description = current.descriptionParts.join(' ').trim()
    criteria.push({
      name: current.name,
      weight: current.weight && Number.isFinite(current.weight) ? current.weight : 20,
      description: description || undefined,
      levels: getDefaultLevels(language),
    })
    current = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const criterionMatch = matchCriterionLine(line)

    if (criterionMatch) {
      flushCurrent()
      const [, rawName, rawWeight, trailing] = criterionMatch
      current = {
        name: (rawName?.replace(/\*\*/g, '') ?? '').trim(),
        weight: rawWeight ? Number.parseInt(rawWeight, 10) : undefined,
        descriptionParts: trailing ? [trailing.trim()] : [],
      }
      continue
    }

    if (current) {
      current.descriptionParts.push(line.replace(/\*\*/g, '').trim())
    }
  }

  flushCurrent()
  return criteria
}

// Add a new function to generate each section of the rubric separately
export async function generateRubricSection(
  section: 'report' | 'demo' | 'individual',
  difficultyLevel: string,
  provider: ProviderFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo: CourseInfo,
  language: 'en' | 'id',
): Promise<ProjectRubricCriterion[]> {
  logAssessmentDebug(`Generating ${section} criteria for ${difficultyLevel} level course...`)
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')

  const sectionTitles =
    language === 'id'
      ? {
          report: 'Laporan',
          demo: 'Presentasi Demo',
          individual: 'Kontribusi Individu',
        }
      : {
          report: 'Report',
          demo: 'Demo Presentation',
          individual: 'Individual Contribution',
        }

  const systemPrompt =
    language === 'id'
      ? `${langDirective(language)}\n\nAnda adalah pengembang asesmen pendidikan ahli untuk mata kuliah universitas. Buat kriteria ${sectionTitles[section]} untuk mata kuliah tingkat ${difficultyLevel} pada ${courseInfo.courseName || 'Big Data Storage and Management'}.

INSTRUKSI PENTING:
${hasSourceMaterials ? '0. Gunakan HANYA materi sumber yang diberikan sebagai dasar kriteria.\n' : ''}
1. Fokus HANYA membuat kriteria untuk bagian ${sectionTitles[section]}.
2. Untuk setiap kriteria, berikan deskripsi rinci untuk tiap level: Sangat Baik (5), Baik (4), Sedang (3), Cukup (2), dan Sangat Kurang (1).
3. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.
4. Respons HARUS berupa JSON valid saja - TIDAK ADA markdown, heading, atau teks lain.
5. MULAI langsung dengan '[' dan AKHIRI dengan ']' tanpa ada teks tambahan.
Catatan: Jangan menyalin atau mengutip teks dari materi sumber yang bukan dalam bahasa target.

FORMAT RESPON (HANYA JSON):
[
  {
    "name": "Kriteria 1",
    "weight": 10,
    "description": "Deskripsi singkat kriteria",
    "levels": {
      "excellent": "Deskripsi performa tingkat sangat baik",
      "good": "Deskripsi performa tingkat baik",
      "average": "Deskripsi performa tingkat sedang",
      "acceptable": "Deskripsi performa tingkat cukup",
      "poor": "Deskripsi performa tingkat sangat kurang"
    }
  }
]

PENTING: Jangan gunakan format markdown (**, ##, dll). Hanya JSON murni.`
      : `${langDirective(language)}\n\nYou are an expert assessment designer for university courses. Create ${sectionTitles[section]} criteria for a ${difficultyLevel} level course ${
          courseInfo.courseName || 'Big Data Storage and Management'
        }.

CRITICAL INSTRUCTIONS:
${hasSourceMaterials ? '0. Use ONLY the provided source materials as the basis for the criteria.\n' : ''}
1. Focus ONLY on criteria for the ${sectionTitles[section]} section.
2. For each criterion, provide detailed descriptions for each level: Excellent (5), Good (4), Average (3), Acceptable (2), and Poor (1).
3. The output MUST be entirely in the requested target language with no language mixing.
4. The response MUST be valid JSON only - NO markdown, headings, or other text.
5. START directly with '[' and END with ']' with no additional text.
Note: Do not copy or quote any text from the source materials that is not in the target language.

RESPONSE FORMAT (JSON ONLY):
[
  {
    "name": "Criterion 1",
    "weight": 10,
    "description": "One-sentence description of the criterion",
    "levels": {
      "excellent": "Description of excellent performance",
      "good": "Description of good performance",
      "average": "Description of average performance",
      "acceptable": "Description of acceptable performance",
      "poor": "Description of poor performance"
    }
  }
]

IMPORTANT: Do not use markdown formatting (**, ##, etc.). Pure JSON only.`

  const systemMessage: ModelMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: ModelMessage = {
    role: 'user',
    content:
      language === 'id'
        ? `Hasilkan kriteria ${sectionTitles[section]} untuk ${courseInfo.courseCode || 'CDS502'} ${courseInfo.courseName || 'Big Data Storage and Management'}.`
        : `Generate ${sectionTitles[section]} criteria for ${courseInfo.courseCode || 'CDS502'} ${courseInfo.courseName || 'Big Data Storage and Management'}.`,
  }

  try {
    // Try structured generation first for better JSON compliance
    try {
      const { object } = await generateObject({
        model: provider(selectedModel),
        schema: z.array(projectRubricCriterionSchema),
        messages: [systemMessage, assistantMessage, userMessage],
        temperature: TEMPERATURE,
        maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 3),
      })

      if (object && Array.isArray(object)) {
        logAssessmentDebug(`Successfully generated ${section} criteria via generateObject`)
        const criteria = object as ProjectRubricCriterion[]

        // Batch enforcement to reduce latency
        const languageEnforcedCriteria = needLanguageEnforcementForCriteria(criteria, language)
          ? await enforceRubricLanguage(criteria, language, provider, selectedModel)
          : criteria
        logAssessmentDebug(`Language enforcement (batched) completed for ${section} criteria`)
        return languageEnforcedCriteria
      }
      logAssessmentDebug(
        `generateObject returned unexpected shape for ${section}, falling back to text parsing`,
      )
    } catch (e) {
      logAssessmentDebug(
        `generateObject failed for ${section} criteria, falling back to generateText:`,
        e,
      )
    }

    // Fallback to text generation
    const response = await generateText({
      model: provider(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 3), // Ensure integer by using Math.floor
    })

    const cleaned = stripThinkTags(response.text)
    logAssessmentDebug(`${section} criteria response:`, cleaned.substring(0, 100) + '...')

    // Strip markdown formatting that might interfere with JSON parsing
    const jsonContent = cleaned
      .replace(/^\s*#.*$/gm, '') // Remove headings
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/^\s*\d+\.\s*/gm, '') // Remove numbered lists
      .replace(/^\s*-\s*/gm, '') // Remove bullet points
      .trim()

    logAssessmentDebug(
      `${section} criteria after markdown cleanup:`,
      jsonContent.substring(0, 200) + '...',
    )

    try {
      const criteria = JSON.parse(jsonContent)
      if (Array.isArray(criteria)) {
        logAssessmentDebug(`Successfully parsed ${section} criteria directly`)

        const languageEnforcedCriteria = needLanguageEnforcementForCriteria(criteria, language)
          ? await enforceRubricLanguage(criteria, language, provider, selectedModel)
          : criteria
        logAssessmentDebug(`Language enforcement (batched) completed for ${section} criteria`)
        return languageEnforcedCriteria
      }
    } catch {
      logAssessmentDebug(`Direct parsing of ${section} criteria failed, trying JSON extraction`)
    }

    const jsonStr = extractJsonFromText(jsonContent)
    if (jsonStr) {
      try {
        const criteria = JSON.parse(jsonStr)
        if (Array.isArray(criteria)) {
          logAssessmentDebug(`Successfully extracted and parsed ${section} criteria JSON`)

          const languageEnforcedCriteria = needLanguageEnforcementForCriteria(criteria, language)
            ? await enforceRubricLanguage(criteria, language, provider, selectedModel)
            : criteria
          logAssessmentDebug(
            `Language enforcement (batched) completed for extracted ${section} criteria`,
          )
          return languageEnforcedCriteria
        }
      } catch (e) {
        console.error(`Failed to parse extracted ${section} criteria JSON:`, e)
      }
    }

    // If all extraction methods fail, try to extract criteria from the text manually
    logAssessmentDebug(`Attempting manual criteria extraction for ${section}`)
    const manualCriteria = extractCriteriaFromText(jsonContent, language)
    if (manualCriteria.length > 0) {
      logAssessmentDebug(
        `Successfully extracted ${manualCriteria.length} criteria manually for ${section}`,
      )

      const languageEnforcedCriteria = needLanguageEnforcementForCriteria(manualCriteria, language)
        ? await enforceRubricLanguage(manualCriteria, language, provider, selectedModel)
        : manualCriteria
      logAssessmentDebug(
        `Language enforcement (batched) completed for manually extracted ${section} criteria`,
      )
      return languageEnforcedCriteria
    }

    // If all extraction methods fail, return default criteria for this section
    logAssessmentDebug(`Using default ${section} criteria due to parsing failure`)
    return getDefaultProjectRubric(language).categories[section]
  } catch (error) {
    console.error(`Error generating ${section} criteria:`, error)
    return getDefaultProjectRubric(language).categories[section]
  }
}

// Modify the generateProjectRubric function to separate generation and combination
export async function generateProjectRubric(
  difficultyLevel: string,
  provider: ProviderFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo: CourseInfo,
  language: 'en' | 'id',
): Promise<ProjectRubric> {
  logAssessmentDebug(`Generating project rubric for ${difficultyLevel} level course...`)

  try {
    // Step 1: Generate report criteria
    const reportCriteria = await generateRubricSection(
      'report',
      difficultyLevel,
      provider,
      selectedModel,
      assistantMessage,
      courseInfo,
      language,
    )

    // Step 2: Generate demo criteria
    const demoCriteria = await generateRubricSection(
      'demo',
      difficultyLevel,
      provider,
      selectedModel,
      assistantMessage,
      courseInfo,
      language,
    )

    // Step 3: Generate individual criteria
    const individualCriteria = await generateRubricSection(
      'individual',
      difficultyLevel,
      provider,
      selectedModel,
      assistantMessage,
      courseInfo,
      language,
    )

    // Step 4: Combine all criteria into a complete rubric
    const defaultRubric = getDefaultProjectRubric(language)

    const combinedRubric: ProjectRubric = {
      categories: {
        report:
          reportCriteria && reportCriteria.length > 0
            ? reportCriteria
            : defaultRubric.categories.report,
        demo:
          demoCriteria && demoCriteria.length > 0 ? demoCriteria : defaultRubric.categories.demo,
        individual:
          individualCriteria && individualCriteria.length > 0
            ? individualCriteria
            : defaultRubric.categories.individual,
      },
      markingScale:
        language === 'id'
          ? 'Skala Penilaian: 1 - Sangat Kurang, 2 - Cukup, 3 - Sedang, 4 - Baik, 5 - Sangat Baik.'
          : 'Grading Scale: 1 - Poor, 2 - Acceptable, 3 - Average, 4 - Good, 5 - Excellent.',
      totalMarks: 100,
      reportWeight: 55,
      demoWeight: 30,
      individualWeight: 15,
    }

    logAssessmentDebug('Successfully generated project rubric with all sections')
    return combinedRubric
  } catch (error) {
    console.error('Error generating complete project rubric:', error)
    // Return default rubric if generation fails
    return getDefaultProjectRubric(language)
  }
}
