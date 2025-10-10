// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { Source } from '../../../payload-types'
import { NextResponse } from 'next/server'
import { createOllama } from 'ollama-ai-provider-v2'
import { type ModelMessage, generateText, generateObject } from 'ai'
import { jsonrepair } from 'jsonrepair'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'
import type { ClientSource } from '@/lib/types/client-source'
import type { AssessmentQuestion, ExplanationObject } from '@/lib/types/assessment-types'
import type { ProjectRubric, ProjectRubricCriterion } from '@/lib/types/project-rubric-criterion'
import type { CourseInfo } from '@/lib/types/course-info-types'

type OllamaFn = ReturnType<typeof createOllama>
type ExtractedJson = {
  type?: string
  duration?: string
  description?: string
  questions?: unknown[]
}
type GeneratedQuestion = { question: string; type: string } | string
type AssessmentMetadata = {
  type: string
  duration: string
  description: string
}
type ChunkWithSourceName = {
  id: number
  source: number | Source
  chunk: string
  order: number
  updatedAt: string
  createdAt: string
  sourceName?: string
}
export const dynamic = 'force-dynamic'

// Configuration constants
const TEMPERATURE = Number.parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const TOKEN_MAX = Number.parseInt(process.env.RAG_TOKEN_MAX ?? '2048')
const TOKEN_RESPONSE_RATIO = Number.parseFloat(process.env.RESPONSE_TOKEN_PERCENTAGE || '0.7')
const TOKEN_RESPONSE_BUDGET = Math.floor(TOKEN_MAX * TOKEN_RESPONSE_RATIO)
const TOKEN_CONTEXT_BUDGET = 1200 // Increased to allow more source content while keeping response budget reasonable
const ASSESSMENT_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.ASSESSMENT_CONCURRENCY || '3'),
)
const ASSESSMENT_REQUEST_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(process.env.ASSESSMENT_REQUEST_TIMEOUT_MS || '125000'),
)

// Language directive helper
const langDirective = (lang: 'en' | 'id') =>
  lang === 'id'
    ? 'PENTING: Semua output harus dalam Bahasa Indonesia yang jelas dan alami.'
    : 'IMPORTANT: All output must be in clear and natural English.'

// Update the getDefaultDuration function to ensure exam duration is 2 hours
const getDefaultDuration = (assessmentType: string): string => {
  switch (assessmentType.toLowerCase()) {
    case 'quiz':
      return '30 minutes'
    case 'test':
      return '1 hour'
    case 'exam':
      return '2 hours' // Ensure exam is always 2 hours
    case 'assignment':
      return '1 week'
    case 'project':
      return '2 weeks'
    case 'discussion':
      return '45 minutes'
    default:
      return '1 hour'
  }
}

// Utility function to count tokens (simple approximation)
function countTokens(text: string): number {
  return text.split(/\s+/).length
}

// Utility function to truncate text to fit within token limit
function truncateToTokenLimit(text: string, maxTokens: number): string {
  if (countTokens(text) <= maxTokens) {
    return text
  }

  // Simple truncation approach - could be improved with smarter summarization
  const words = text.split(' ')
  let result = ''
  let currentTokens = 0

  for (const word of words) {
    const wordTokens = countTokens(word + ' ')
    if (currentTokens + wordTokens > maxTokens) {
      break
    }
    result += word + ' '
    currentTokens += wordTokens
  }

  return result.trim() + '...'
}

// Helper: wrap a promise with a timeout
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => T | Promise<T>,
): Promise<T> {
  let timeoutId: NodeJS.Timeout
  return await Promise.race<Promise<T> | T>([
    promise,
    new Promise<T>((resolve) => {
      timeoutId = setTimeout(async () => {
        if (onTimeout) {
          try {
            const fallback = await onTimeout()
            resolve(fallback)
          } catch {
            // noop; will hang without a resolution, but onTimeout should not throw
          }
        }
      }, ms)
    }),
  ]).finally(() => clearTimeout(timeoutId))
}

// Helper: process an array with limited concurrency, preserving order
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const workers: Promise<void>[] = []

  const worker = async () => {
    while (true) {
      const current = nextIndex++
      if (current >= items.length) break
      try {
        results[current] = await mapper(items[current], current)
      } catch (e) {
        // In case of unexpected error, rethrow after annotation
        throw e
      }
    }
  }

  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

// Note: We intentionally do not gate documents by their detected language.
// When documents are selected, we always use them as the knowledge base
// and enforce target-language-only outputs in the prompts regardless of
// the source language.

// Improve the extractJsonFromText function to be more robust
function extractJsonFromText(text: string): string | null {
  try {
    // Clean up the text first - remove markdown code block markers
    const cleanedText = stripCodeFences(text)

    // First, try to parse the entire text as JSON directly
    try {
      JSON.parse(cleanedText)
      console.log('Direct JSON parsing successful')
      return cleanedText // If it parses successfully, return the entire text
    } catch {
      console.log('Direct parsing failed, trying alternative extraction methods')
    }

    // Try jsonrepair on the whole cleaned text as an early fallback
    try {
      let repairedWhole: string
      try {
        repairedWhole = jsonrepair(cleanedText)
      } catch (e) {
        console.log('jsonrepair failed on entire text in extractJsonFromText:', e)
        repairedWhole = cleanedText
      }
      JSON.parse(repairedWhole)
      console.log('jsonrepair succeeded on entire text in extractJsonFromText')
      return repairedWhole
    } catch {
      // continue
    }

    // Look for JSON array pattern with more flexible regex
    const arrayRegex = /(\[[\s\S]*?\])/g
    const arrayMatches = cleanedText.match(arrayRegex)

    if (arrayMatches && arrayMatches.length > 0) {
      // Try each match until we find valid JSON
      for (const match of arrayMatches) {
        try {
          const sanitized = sanitizeJsonString(match)
          // Test if it's valid JSON by parsing it
          JSON.parse(sanitized)
          console.log('Found valid JSON array in text fragment')
          return sanitized
        } catch {
          // Try jsonrepair for this fragment
          try {
            let repaired: string
            try {
              repaired = jsonrepair(match)
            } catch (e) {
              console.log('jsonrepair failed on array fragment, continuing:', e)
              throw e
            }
            JSON.parse(repaired)
            console.log('jsonrepair succeeded on array fragment')
            return repaired
          } catch {
            // Continue to next match if this one isn't valid
            continue
          }
        }
      }
    }

    // Look for JSON object pattern with more flexible regex
    const jsonRegex = /(\{[\s\S]*?\})/g
    const matches = cleanedText.match(jsonRegex)

    if (matches && matches.length > 0) {
      // Try each match until we find valid JSON
      for (const match of matches) {
        try {
          const sanitized = sanitizeJsonString(match)
          // Test if it's valid JSON by parsing it
          JSON.parse(sanitized)
          console.log('Found valid JSON in text fragment')
          return sanitized
        } catch {
          // Try jsonrepair for this fragment
          try {
            let repaired: string
            try {
              repaired = jsonrepair(match)
            } catch (e) {
              console.log('jsonrepair failed on object fragment, continuing:', e)
              throw e
            }
            JSON.parse(repaired)
            console.log('jsonrepair succeeded on object fragment')
            return repaired
          } catch {
            // Continue to next match if this one isn't valid
            continue
          }
        }
      }
    }

    // If no valid JSON object found, try to extract JSON from the text
    // This handles cases where the JSON might be embedded in other text
    const startBrace = cleanedText.indexOf('{')
    const endBrace = cleanedText.lastIndexOf('}')
    const startBracket = cleanedText.indexOf('[')
    const endBracket = cleanedText.lastIndexOf(']')

    // Try to extract object
    if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
      const jsonCandidate = cleanedText.substring(startBrace, endBrace + 1)
      try {
        const sanitized = sanitizeJsonString(jsonCandidate)
        JSON.parse(sanitized)
        console.log('Extracted JSON object from text using brace positions')
        return sanitized
      } catch (e) {
        console.log('Failed to parse JSON object extracted using brace positions:', e)
        try {
          let repaired: string
          try {
            repaired = jsonrepair(jsonCandidate)
          } catch (e2) {
            console.log('jsonrepair failed on object extracted by braces:', e2)
            throw e2
          }
          JSON.parse(repaired)
          console.log('jsonrepair succeeded on object extracted by braces')
          return repaired
        } catch (e2) {
          console.log('jsonrepair also failed on object extracted by braces:', e2)
        }
      }
    }

    // Try to extract array
    if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
      const jsonCandidate = cleanedText.substring(startBracket, endBracket + 1)
      try {
        const sanitized = sanitizeJsonString(jsonCandidate)
        JSON.parse(sanitized)
        console.log('Extracted JSON array from text using bracket positions')
        return sanitized
      } catch (e) {
        console.log('Failed to parse JSON array extracted using bracket positions:', e)
        try {
          let repaired: string
          try {
            repaired = jsonrepair(jsonCandidate)
          } catch (e2) {
            console.log('jsonrepair failed on array extracted by brackets:', e2)
            throw e2
          }
          JSON.parse(repaired)
          console.log('jsonrepair succeeded on array extracted by brackets')
          return repaired
        } catch (e2) {
          console.log('jsonrepair also failed on array extracted by brackets:', e2)
        }
      }
    }

    // Try to extract specific fields if full JSON parsing fails
    const extractedJson: ExtractedJson = {}

    // Extract type
    const typeMatch = cleanedText.match(/"type"\s*:\s*"([^"]+)"/)
    if (typeMatch && typeMatch[1]) {
      extractedJson.type = typeMatch[1]
    }

    // Extract duration
    const durationMatch = cleanedText.match(/"duration"\s*:\s*"([^"]+)"/)
    if (durationMatch && durationMatch[1]) {
      extractedJson.duration = durationMatch[1]
    }

    // Extract description
    const descMatch = cleanedText.match(/"description"\s*:\s*"([^"]+)"/)
    if (descMatch && descMatch[1]) {
      extractedJson.description = descMatch[1]
    }

    // Extract questions array if present
    const questionsMatch = cleanedText.match(/"questions"\s*:\s*(\[[\s\S]*?\])/)
    if (questionsMatch && questionsMatch[1]) {
      try {
        extractedJson.questions = JSON.parse(questionsMatch[1])
        console.log('Extracted questions array from text')
      } catch (e) {
        console.log('Failed to parse extracted questions array:', e)
      }
    }

    // If we extracted any fields, return the constructed JSON
    if (Object.keys(extractedJson).length > 0) {
      console.log('Constructed JSON from extracted fields:', extractedJson)
      return JSON.stringify(extractedJson)
    }

    console.log('No valid JSON structure found in text')
    return null
  } catch (e) {
    console.error('Error in extractJsonFromText:', e)
    return null
  }
}

// Improve the sanitizeJsonString function to be more robust
function sanitizeJsonString(jsonString: string): string {
  try {
    // Remove any non-printable characters
    let cleaned = jsonString.replace(/[\x00-\x1F\x7F-\x9F]/g, '')

    // Fix common JSON syntax issues
    cleaned = cleaned
      // Fix unescaped backslashes
      .replace(/(?<!\\)\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')
      // Fix unescaped quotes in strings
      .replace(/(?<!\\)"(?=(.*":\s*"))/g, '\\"')
      // Fix trailing commas in objects and arrays
      .replace(/,\s*}/g, '}')
      .replace(/,\s*\]/g, ']')
      // Fix missing quotes around property names
      .replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3')
      // Fix newlines in string values
      .replace(/"\s*\n\s*([^"]*)"/g, '" $1"')
      // Fix missing commas between array elements
      .replace(/}(\s*){/g, '},\n$1{')
      .replace(/](\s*)\[/g, '],\n$1[')
      // Fix extra commas
      .replace(/,(\s*[}\]])/g, '$1')

    return cleaned
  } catch (e) {
    console.error('Error in sanitizeJsonString:', e)
    return jsonString // Return original if sanitization fails
  }
}

// Helper: strip markdown code fences (```json ... ``` or ``` ... ```)
function stripCodeFences(text: string): string {
  if (!text) return text
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i
  const match = text.match(fenceRegex)
  return match ? match[1].trim() : text.replace(/```json|```/g, '').trim()
}

// Heuristic language detection for English vs Bahasa Indonesia
function detectLikelyLanguage(text: string): 'en' | 'id' | 'unknown' {
  const lower = text.toLowerCase()
  const idWords = [
    'dan',
    'yang',
    'untuk',
    'dengan',
    'pada',
    'adalah',
    'tidak',
    'ini',
    'itu',
    'atau',
    'dari',
    'ke',
    'dalam',
    'sebuah',
    'contoh',
    'misalnya',
    'menggunakan',
  ]
  const enWords = [
    'and',
    'the',
    'for',
    'with',
    'on',
    'is',
    'not',
    'this',
    'that',
    'or',
    'from',
    'to',
    'in',
    'example',
    'using',
  ]
  let idScore = 0
  let enScore = 0
  for (const w of idWords) if (lower.includes(` ${w} `)) idScore++
  for (const w of enWords) if (lower.includes(` ${w} `)) enScore++
  if (idScore >= enScore + 2) return 'id'
  if (enScore >= idScore + 2) return 'en'
  return 'unknown'
}

// Ensure plain text outputs adhere to selected language by a brief rewrite prompt (no translation wording)
async function ensureTargetLanguageText(
  text: string,
  language: 'en' | 'id',
  ollama: OllamaFn,
  selectedModel: string,
  options?: { force?: boolean },
): Promise<string> {
  const detected = detectLikelyLanguage(text)
  // When force=true, only skip if it already matches target; otherwise rewrite even if unknown
  if (detected === language) return text
  if (detected === 'unknown' && !options?.force) return text

  const directive =
    language === 'id'
      ? 'PENTING: Tulis ulang seluruh konten berikut dalam Bahasa Indonesia yang jelas dan alami. Jangan gunakan kata dari bahasa lain. Jangan ubah struktur atau makna.'
      : 'IMPORTANT: Rewrite all of the following content in clear and natural English only. Do not use any words from other languages. Do not change the structure or meaning.'

  const systemMessage: ModelMessage = { role: 'system', content: directive }
  const userMessage: ModelMessage = { role: 'user', content: text }
  try {
    const resp = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, userMessage],
      temperature: Math.max(0, TEMPERATURE - 0.05),
      maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
    })
    return stripThinkTags(resp.text)
  } catch {
    return text
  }
}

// Decide if a rubric array likely needs language enforcement based on a small sample
function needLanguageEnforcementForCriteria(
  criteria: ProjectRubricCriterion[],
  language: 'en' | 'id',
): boolean {
  try {
    const sample = criteria
      .slice(0, 3)
      .map((c) => [c.name, c.description, c.levels?.excellent, c.levels?.good].join(' '))
      .join(' ')
    const detected = detectLikelyLanguage(sample)
    // Enforce when sample language doesn't match the target (including 'unknown' cases)
    return detected !== language
  } catch {
    return false
  }
}

// Batch-enforce rubric language in one model call to reduce latency
async function enforceRubricLanguage(
  criteria: ProjectRubricCriterion[],
  language: 'en' | 'id',
  ollama: OllamaFn,
  selectedModel: string,
): Promise<ProjectRubricCriterion[]> {
  const directive =
    language === 'id'
      ? `${langDirective(language)}\n\nTugas: Ubah SEMUA nilai string di dalam array JSON berikut menjadi Bahasa Indonesia yang jelas dan alami.\nJANGAN ubah kunci, bentuk array, urutan item, tipe data numerik, atau bobot.\nKembalikan HANYA JSON (array) dengan struktur yang sama.`
      : `${langDirective(language)}\n\nTask: Rewrite ALL string values in the following JSON array into clear and natural English.\nDO NOT change keys, array shape, item order, numeric types, or weights.\nReturn JSON ONLY (the array) with exactly the same structure.`

  const systemMessage: ModelMessage = { role: 'system', content: directive }
  const userMessage: ModelMessage = { role: 'user', content: JSON.stringify(criteria) }

  try {
    const resp = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, userMessage],
      temperature: Math.max(0, TEMPERATURE - 0.05),
      maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 4),
    })
    const cleaned = stripThinkTags(resp.text)
    const jsonStr = extractJsonFromText(cleaned) || cleaned
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed)) return parsed as ProjectRubricCriterion[]
  } catch (e) {
    console.log('Batch rubric language enforcement failed, returning original criteria:', e)
  }
  return criteria
}

// Define the default project rubric with a language-aware structure (English default)
const getDefaultProjectRubric = (language: 'en' | 'id' = 'en'): ProjectRubric => {
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

// Modify the generateProjectRubric function to separate generation and combination
async function generateProjectRubric(
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo: CourseInfo,
  language: 'en' | 'id',
): Promise<ProjectRubric> {
  console.log(`Generating project rubric for ${difficultyLevel} level course...`)

  try {
    // Step 1: Generate report criteria
    const reportCriteria = await generateRubricSection(
      'report',
      difficultyLevel,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
      language,
    )

    // Step 2: Generate demo criteria
    const demoCriteria = await generateRubricSection(
      'demo',
      difficultyLevel,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
      language,
    )

    // Step 3: Generate individual criteria
    const individualCriteria = await generateRubricSection(
      'individual',
      difficultyLevel,
      ollama,
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

    console.log('Successfully generated project rubric with all sections')
    return combinedRubric
  } catch (error) {
    console.error('Error generating complete project rubric:', error)
    // Return default rubric if generation fails
    return getDefaultProjectRubric(language)
  }
}

// Helper function to manually extract criteria from text when JSON parsing fails
function extractCriteriaFromText(text: string, language: 'en' | 'id'): ProjectRubricCriterion[] {
  const criteria: ProjectRubricCriterion[] = []

  // Look for numbered items or bullet points that might contain criteria
  const lines = text.split('\n')
  let currentCriterion: Partial<ProjectRubricCriterion> | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // Look for numbered criteria (1., 2., etc.) or bullet points
    const criterionMatch = trimmed.match(
      /^(?:\d+\.|\*|-)\s*\*?\*?([^(]+?)(?:\s*\((\d+)%?\))?\*?\*?/,
    )
    if (criterionMatch) {
      // Save previous criterion if exists
      if (currentCriterion && currentCriterion.name) {
        criteria.push({
          name: currentCriterion.name,
          weight: currentCriterion.weight || 20,
          levels: currentCriterion.levels || getDefaultLevels(language),
        })
      }

      // Start new criterion
      currentCriterion = {
        name: criterionMatch[1].trim(),
        weight: criterionMatch[2] ? parseInt(criterionMatch[2]) : 20,
        levels: getDefaultLevels(language),
      }
    }
  }

  // Add last criterion if exists
  if (currentCriterion && currentCriterion.name) {
    criteria.push({
      name: currentCriterion.name,
      weight: currentCriterion.weight || 20,
      levels: currentCriterion.levels || getDefaultLevels(language),
    })
  }

  return criteria
}

// Helper function to get default level descriptions
function getDefaultLevels(language: 'en' | 'id'): {
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

// Add a new function to generate each section of the rubric separately
async function generateRubricSection(
  section: 'report' | 'demo' | 'individual',
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo: CourseInfo,
  language: 'en' | 'id',
): Promise<ProjectRubricCriterion[]> {
  console.log(`Generating ${section} criteria for ${difficultyLevel} level course...`)
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
        model: ollama(selectedModel),
        output: 'no-schema',
        messages: [systemMessage, assistantMessage, userMessage],
        temperature: TEMPERATURE,
        maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 3),
      })

      if (object && Array.isArray(object)) {
        console.log(`Successfully generated ${section} criteria via generateObject`)
        const criteria = object as unknown as ProjectRubricCriterion[]

        // Batch enforcement to reduce latency
        const languageEnforcedCriteria = needLanguageEnforcementForCriteria(criteria, language)
          ? await enforceRubricLanguage(criteria, language, ollama, selectedModel)
          : criteria
        console.log(`Language enforcement (batched) completed for ${section} criteria`)
        return languageEnforcedCriteria
      }
      console.log(
        `generateObject returned unexpected shape for ${section}, falling back to text parsing`,
      )
    } catch (e) {
      console.log(`generateObject failed for ${section} criteria, falling back to generateText:`, e)
    }

    // Fallback to text generation
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 3), // Ensure integer by using Math.floor
    })

    const cleaned = stripThinkTags(response.text)
    console.log(`${section} criteria response:`, cleaned.substring(0, 100) + '...')

    // Strip markdown formatting that might interfere with JSON parsing
    const jsonContent = cleaned
      .replace(/^\s*#.*$/gm, '') // Remove headings
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/^\s*\d+\.\s*/gm, '') // Remove numbered lists
      .replace(/^\s*-\s*/gm, '') // Remove bullet points
      .trim()

    console.log(
      `${section} criteria after markdown cleanup:`,
      jsonContent.substring(0, 200) + '...',
    )

    try {
      const criteria = JSON.parse(jsonContent)
      if (Array.isArray(criteria)) {
        console.log(`Successfully parsed ${section} criteria directly`)

        const languageEnforcedCriteria = needLanguageEnforcementForCriteria(criteria, language)
          ? await enforceRubricLanguage(criteria, language, ollama, selectedModel)
          : criteria
        console.log(`Language enforcement (batched) completed for ${section} criteria`)
        return languageEnforcedCriteria
      }
    } catch {
      console.log(`Direct parsing of ${section} criteria failed, trying JSON extraction`)
    }

    const jsonStr = extractJsonFromText(jsonContent)
    if (jsonStr) {
      try {
        const criteria = JSON.parse(jsonStr)
        if (Array.isArray(criteria)) {
          console.log(`Successfully extracted and parsed ${section} criteria JSON`)

          const languageEnforcedCriteria = needLanguageEnforcementForCriteria(criteria, language)
            ? await enforceRubricLanguage(criteria, language, ollama, selectedModel)
            : criteria
          console.log(`Language enforcement (batched) completed for extracted ${section} criteria`)
          return languageEnforcedCriteria
        }
      } catch (e) {
        console.error(`Failed to parse extracted ${section} criteria JSON:`, e)
      }
    }

    // If all extraction methods fail, try to extract criteria from the text manually
    console.log(`Attempting manual criteria extraction for ${section}`)
    const manualCriteria = extractCriteriaFromText(jsonContent, language)
    if (manualCriteria.length > 0) {
      console.log(
        `Successfully extracted ${manualCriteria.length} criteria manually for ${section}`,
      )

      const languageEnforcedCriteria = needLanguageEnforcementForCriteria(manualCriteria, language)
        ? await enforceRubricLanguage(manualCriteria, language, ollama, selectedModel)
        : manualCriteria
      console.log(
        `Language enforcement (batched) completed for manually extracted ${section} criteria`,
      )
      return languageEnforcedCriteria
    }

    // If all extraction methods fail, return default criteria for this section
    console.log(`Using default ${section} criteria due to parsing failure`)
    return getDefaultProjectRubric(language).categories[section]
  } catch (error) {
    console.error(`Error generating ${section} criteria:`, error)
    return getDefaultProjectRubric(language).categories[section]
  }
}

// Generate project description based on course information and source materials
async function generateProjectDescription(
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo: CourseInfo,
  language: 'en' | 'id',
): Promise<string> {
  console.log(`Generating project description for ${difficultyLevel} level course...`)

  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')
  console.log('=== PROJECT DESCRIPTION GENERATION ===')
  console.log('Has source materials:', hasSourceMaterials)
  console.log('Language:', language)
  console.log('Will use source-based prompts:', hasSourceMaterials)
  console.log('Assistant message content length:', (assistantMessage.content as string).length)
  console.log(
    'Assistant message preview:',
    (assistantMessage.content as string).substring(0, 200) + '...',
  )
  console.log('=== END PROJECT DESCRIPTION DEBUG ===')

  // Use modular prompt builder for project description
  const projectPrompts = await import('./prompts/project')
  const systemPrompt = projectPrompts.buildProjectDescriptionSystemPrompt(
    difficultyLevel,
    courseInfo,
    language,
    hasSourceMaterials,
  )

  const systemMessage: ModelMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: ModelMessage = {
    role: 'user',
    content: projectPrompts.buildProjectDescriptionUserPrompt(courseInfo, language),
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE + 0.1,
      maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
    })

    let cleaned = stripThinkTags(response.text)
    console.log(
      'Raw project description (before language enforcement):',
      cleaned.substring(0, 200) + '...',
    )

    // Always ensure final text adheres to the selected language (regardless of source language)
    // But be careful not to override source-based content with course-based content
    if (hasSourceMaterials) {
      console.log(
        'Skipping language enforcement for source-based content to preserve source fidelity',
      )
      // For source-based content, only do minimal language enforcement to avoid content drift
      const detected = detectLikelyLanguage(cleaned)
      if (detected !== language && detected !== 'unknown') {
        console.log(
          `Language mismatch detected (${detected} vs ${language}), but preserving source-based content`,
        )
      }
    } else {
      cleaned = await ensureTargetLanguageText(cleaned, language, ollama, selectedModel)
      console.log('Applied language enforcement for course-based content')
    }

    console.log('Final project description:', cleaned.substring(0, 200) + '...')
    console.log('Project description generated successfully')
    return cleaned
  } catch (error) {
    console.error('Error generating project description:', error)

    // If sources were available but generation failed, return a more generic fallback
    if (hasSourceMaterials) {
      return language === 'id'
        ? `**Instruksi Proyek**

Berdasarkan materi sumber yang disediakan, buatlah proyek yang menunjukkan pemahaman mendalam terhadap konsep dan teknologi yang dibahas dalam materi tersebut.

**Deliverables:**
• Laporan komprehensif yang menganalisis dan menerapkan konsep dari materi sumber
• Implementasi praktis atau demonstrasi teknis
• Presentasi yang menjelaskan metodologi dan temuan

**Persyaratan:**
• Gunakan pendekatan yang sesuai dengan teknologi dan metodologi yang dijelaskan dalam materi sumber
• Analisis mendalam terhadap masalah yang diidentifikasi
• Rekomendasi berdasarkan temuan

Durasi: ${courseInfo.duration || '2 minggu'}
`
        : `**Project Instructions**

Based on the provided source materials, create a project that demonstrates deep understanding of the concepts and technologies discussed in the materials.

**Deliverables:**
• Comprehensive report analyzing and applying concepts from source materials  
• Practical implementation or technical demonstration
• Presentation explaining methodology and findings

**Requirements:**
• Use approaches consistent with technologies and methodologies explained in source materials
• In-depth analysis of identified problems
• Recommendations based on findings

Duration: ${courseInfo.duration || '2 weeks'}
`
    }

    // Course-based fallback when no sources were available
    return language === 'id'
      ? `
Sekolah Ilmu Komputer, Universiti Sains Malaysia 
 
Batas waktu pengumpulan adalah ${courseInfo.deadline || '10 Januari 2024'}, pukul 6:15 sore. Pengumpulan daring melalui e-learn. 
 
${courseInfo.courseCode || 'CDS502'} ${courseInfo.courseName || 'Big Data Storage and Management'}  
${courseInfo.semester || 'Semester 1'}, ${courseInfo.academicYear || '2023/2024'} 
 
PROYEK (20%) – LAPORAN & PRESENTASI
(Kerja Kelompok: Maksimal ${courseInfo.groupSize || 4} anggota per kelompok) 
 
Instruksi: Proyek akan dievaluasi berdasarkan kerja kelompok serta kontribusi individu melalui laporan tertulis dan presentasi kelompok. Setiap kelompok harus menyerahkan laporan tertulis dan melakukan presentasi. Pembentukan kelompok dilakukan melalui tautan Padlet yang tersedia di portal e-learn. 
 
Batas Waktu: ${courseInfo.deadline || '10 Januari 2024'} (6:15 sore). Serahkan softcopy laporan/slide & kode sumber melalui portal e-learning pada waktu kelas. Presentasi kelompok akan dilaksanakan di kelas selama dua minggu. Penentuan urutan presentasi dilakukan secara acak. 
 
Deskripsi Proyek: Setiap kelompok harus mengidentifikasi sebuah dataset yang relevan dengan konten mata kuliah. Bangun solusi penyimpanan dan pemrosesan data yang sesuai berdasarkan materi kuliah. Anda mungkin perlu mengunduh dan memasang perangkat lunak yang diperlukan atau menggunakan layanan cloud. Anda dapat memakai mesin lokal (laptop) atau layanan cloud (Google Cloud, Amazon, dll.) atau teknologi kontainer (Docker) untuk menyiapkan lingkungan. Masukkan dataset ke dalam basis data. Jalankan minimal empat kueri yang bermakna yang paling menggambarkan data. Bandingkan dan diskusikan performanya dalam hal kemudahan penggunaan, pembuatan kueri, dan kecepatan pemrosesan data. 
 
Deliverables wajib mencakup:
• Platform yang dipilih untuk implementasi  
• Proses instalasi dan pemasukan data  
• Minimal lima kueri atau operasi bermakna  
• Perbandingan dan diskusi performa  
• Rekomendasi & pelajaran yang dipetik  
 
Panduan penyusunan laporan:
i. Abstrak  
ii. Pendahuluan  
iii. Konten Proyek
  1. Deskripsi singkat dataset  
  2. Pemilihan platform implementasi
  3. Proses instalasi, konstruksi sistem, dan pemasukan data
  4. Minimal 4 operasi bermakna
  5. Perbandingan, diskusi, dan rekomendasi
  6. Pernyataan penutup
iv. Pelajaran yang dipetik dari proyek
v. Pembagian peran anggota kelompok secara jelas  
vi. Kesimpulan
vii. Referensi (Minimal 8 referensi termasuk 4 artikel jurnal)
viii. Lampiran (Jika ada)
 
Skema Penilaian: lihat rubrik yang diunggah pada e-learn. 
 
Untuk presentasi di kelas, setiap kelompok mendapat waktu sekitar 15 menit termasuk tanya jawab:
• Setiap anggota diharapkan mempresentasikan bagian tugasnya. 
 
Kumpulkan berikut ini bersama laporan yang diformat baik (satu pengumpulan per kelompok):
• Format IEEE (lihat contoh templat di e-learn)
• Soft copy - (Laporan + kode sumber dan slide): e-learning 
 
Catatan:  
Laporan harus menyertakan lampiran yang menjelaskan secara rinci kontribusi setiap anggota kelompok. Jika bagian laporan disalin langsung tanpa referensi, nilai F akan diberikan.
`
      : `
School of Computer Science, Universiti Sains Malaysia

Submission deadline is ${courseInfo.deadline || 'January 10, 2024'}, at 6:15 pm. Online submission via e-learn.

${courseInfo.courseCode || 'CDS502'} ${courseInfo.courseName || 'Big Data Storage and Management'}
${courseInfo.semester || 'Semester 1'}, ${courseInfo.academicYear || '2023/2024'}

PROJECT (20%) – REPORT & PRESENTATION
(Group Work: Maximum ${courseInfo.groupSize || 4} members per group)

Instructions: The project will be evaluated based on group work and individual contributions through a written report and a group presentation. Each group must submit a written report and deliver a presentation. Group formation is done via the Padlet link available on the e-learn portal.

Deadline: ${courseInfo.deadline || 'January 10, 2024'} (6:15 pm). Submit the soft copy of the report/slides & source code via the e-learning portal during class time. Group presentations will be conducted in class over two weeks. The presentation order will be randomized.

Project Description: Each group must identify a dataset relevant to the course content. Build an appropriate data storage and processing solution based on the course material. You may need to download and install required software or use cloud services. You may use a local machine (laptop) or cloud services (Google Cloud, Amazon, etc.) or container technologies (Docker) to set up the environment. Ingest the dataset into the database. Execute at least four meaningful queries that best represent the data. Compare and discuss performance in terms of ease of use, query creation, and data processing speed.

Required Deliverables:
• Platform chosen for implementation
• Installation process and data ingestion
• At least five meaningful queries or operations
• Performance comparison and discussion
• Recommendations & lessons learned

Report Guidelines:
i. Abstract
ii. Introduction
iii. Project Content
  1. Brief dataset description
  2. Implementation platform selection
  3. Installation, system construction, and data ingestion process
  4. At least 4 meaningful operations
  5. Comparison, discussion, and recommendations
  6. Closing statement
iv. Lessons learned from the project
v. Clear division of group member roles
vi. Conclusion
vii. References (Minimum 8 references including 4 journal articles)
viii. Appendix (If any)

Assessment Scheme: refer to the rubric uploaded on e-learn.

For in-class presentations, each group has approximately 15 minutes including Q&A:
• Each member is expected to present their task component.

Submit the following along with a well-formatted report (one submission per group):
• IEEE format (see template example in e-learn)
• Soft copy - (Report + source code and slides): e-learning
`
  }
}

async function generateQuestions(
  assessmentType: string,
  difficultyLevel: string,
  numQuestions: number,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo?: CourseInfo,
  language: 'en' | 'id' = 'en',
): Promise<GeneratedQuestion[]> {
  console.log(`Generating ${numQuestions} questions for ${assessmentType} assessment...`)

  // Coverity fix: check for null/undefined courseInfo before use
  if (!courseInfo) {
    console.error('generateQuestions: courseInfo is null or undefined')
    return [
      {
        question: 'Unable to generate questions: course information is missing.',
        type: assessmentType,
      },
    ]
  }

  // For project assessments, generate a specialized project question
  if (assessmentType.toLowerCase() === 'project') {
    console.log('Generating project description instead of standard questions')
    try {
      const projectDescription = await generateProjectDescription(
        difficultyLevel,
        ollama,
        selectedModel,
        assistantMessage,
        courseInfo,
        language,
      )

      console.log('Project description generated successfully')

      // Return the project description as a single question
      return [
        {
          question: projectDescription,
          type: 'project',
        },
      ]
    } catch (error) {
      console.error('Error generating project description:', error)
      return [
        {
          question: `
Judul Proyek: ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || ''} Project

Instruksi: Proyek ini dirancang untuk menilai pemahaman Anda terhadap materi kuliah.
Silakan bekerja dalam kelompok beranggotakan ${courseInfo?.groupSize || 4} untuk menyelesaikan proyek ini.

Deskripsi Proyek:
Buat sebuah proyek komprehensif yang menunjukkan pemahaman Anda terhadap konsep-konsep kunci yang dibahas dalam mata kuliah ini.
Proyek harus mencakup komponen implementasi dan dokumentasi.

Deliverables (Hasil yang Harus Dikumpulkan):
1. Laporan rinci yang menjelaskan pendekatan, metodologi, dan temuan
2. Kode sumber atau berkas implementasi
3. Presentasi yang merangkum proyek

Batas Waktu: ${courseInfo?.deadline || 'Akhir semester'}
          `,
          type: 'project',
        },
      ]
    }
  }

  // Determine if we have source materials
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')

  // Standard question generation for non-project assessments
  // Use modular prompt builder only for exam; keep inline prompts otherwise
  let systemPrompt: string
  if (assessmentType.toLowerCase() === 'exam') {
    const examPrompts = await import('./prompts/exam')
    systemPrompt = examPrompts.buildExamQuestionsSystemPrompt(
      difficultyLevel,
      assessmentType,
      courseInfo,
      language,
      hasSourceMaterials,
      numQuestions,
    )
  } else {
    systemPrompt =
      language === 'id'
        ? `${langDirective(language)}\n\nAnda adalah pengembang asesmen pendidikan ahli dalam bidang ${
            courseInfo?.courseName || 'mata kuliah ini'
          }. Hasilkan ${numQuestions} pertanyaan unik untuk asesmen ${assessmentType} tingkat ${difficultyLevel}.

INSTRUKSI PENTING:
${
  hasSourceMaterials
    ? `1. Anda HARUS mendasarkan seluruh konten SEPENUHNYA pada materi sumber yang disediakan.
2. Ambil konsep kunci, terminologi, contoh, dan penjelasan langsung dari materi sumber.
3. Jangan perkenalkan konsep atau informasi yang tidak ada dalam materi sumber.
4. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.
Catatan: Jangan menyalin atau mengutip teks dari materi sumber yang bukan dalam bahasa target.`
    : `1. Karena tidak ada materi sumber, dasarkan pertanyaan pada kurikulum standar untuk ${
        courseInfo?.courseName || 'mata kuliah ini'
      }.
2. Fokus pada konsep inti, teori, dan aplikasi umum.
3. Pastikan tingkat akademik sesuai konteeks universitas.
4. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.`
}
4. Pertanyaan harus beragam dan mencakup berbagai topik.
5. Respons HARUS berupa array JSON string.

FORMAT:
[
  "Pertanyaan 1",
  "Pertanyaan 2"
]

JANGAN sertakan teks di luar array JSON.`
        : `${langDirective(language)}\n\nYou are an expert assessment designer in ${
            courseInfo?.courseName || 'this course'
          }. Generate ${numQuestions} unique questions for a ${difficultyLevel}-level ${assessmentType} assessment.

CRITICAL INSTRUCTIONS:
${
  hasSourceMaterials
    ? `1. You MUST base ALL content ENTIRELY on the provided source materials.
2. Derive key concepts, terminology, examples, and explanations directly from the sources.
3. Do not introduce concepts or information not present in the sources.
4. The output MUST be entirely in the requested target language with no language mixing.
Note: Do not copy or quote any text from the source materials that is not in the target language.`
    : `1. Since there are no source materials, base the questions on the standard curriculum for ${
        courseInfo?.courseName || 'this course'
      }.
2. Focus on core concepts, theories, and common applications.
3. Ensure the academic level fits a university context.
4. The output MUST be entirely in the requested target language with no language mixing.`
}
4. Questions should be diverse and cover multiple topics.
5. The response MUST be a JSON array of strings.

FORMAT:
[
  "Question 1",
  "Question 2"
]

DO NOT include any text outside the JSON array.`
  }

  const systemMessage: ModelMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: ModelMessage = {
    role: 'user',
    content:
      assessmentType.toLowerCase() === 'exam'
        ? (await import('./prompts/exam')).buildExamQuestionsUserPrompt(
            hasSourceMaterials,
            courseInfo,
            language,
            numQuestions,
            assessmentType,
          )
        : language === 'id'
          ? `Hasilkan ${numQuestions} pertanyaan unik untuk asesmen ${assessmentType} pada mata kuliah ${
              courseInfo?.courseCode || ''
            } ${courseInfo?.courseName || 'mata kuliah ini'}. Jawab dalam format yang diminta.`
          : `Generate ${numQuestions} unique questions for the ${assessmentType} assessment in the course ${
              courseInfo?.courseCode || ''
            } ${courseInfo?.courseName || 'this course'}. Follow the requested output format.`,
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxOutputTokens: Math.floor(TOKEN_MAX / 2),
    })

    const cleaned = stripThinkTags(response.text)
    console.log('Questions response:', cleaned)

    try {
      const questions = JSON.parse(cleaned)
      if (Array.isArray(questions)) {
        console.log('Successfully parsed questions directly')
        return questions
      }
    } catch {
      console.log('Direct parsing failed, trying JSON extraction')
    }

    const jsonStr = extractJsonFromText(cleaned)
    if (jsonStr) {
      try {
        const questions = JSON.parse(jsonStr)
        if (Array.isArray(questions)) {
          console.log('Successfully extracted and parsed questions JSON')
          return questions
        }
      } catch (e) {
        console.error('Failed to parse extracted questions JSON:', e)
      }
    }

    // If all extraction methods fail, extract questions from the response text
    console.log('Extracting questions from response text')
    const questionsArray: string[] = []
    const lines = cleaned.split('\n')
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine.length > 0) {
        questionsArray.push(trimmedLine)
      }
    }

    if (questionsArray.length > 0) {
      console.log('Successfully extracted questions from response text')
      return questionsArray
    }

    // If all extraction methods fail, return a default question
    console.log('Using default question due to parsing failure')
    return [
      language === 'id'
        ? 'Apa saja konsep kunci yang dibahas dalam mata kuliah ini?'
        : 'What are the key concepts covered in this course?',
    ]
  } catch (error) {
    console.error('Error generating questions:', error)
    return [
      language === 'id'
        ? 'Apa saja konsep kunci yang dibahas dalam mata kuliah ini?'
        : 'What are the key concepts covered in this course?',
    ]
  }
}

async function generateAssessmentMetadata(
  assessmentType: string,
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo: CourseInfo | undefined,
  language: 'en' | 'id',
): Promise<AssessmentMetadata> {
  console.log(`Generating metadata for ${assessmentType} assessment...`)

  // For project assessments, use specialized metadata
  if (assessmentType.toLowerCase() === 'project' && courseInfo) {
    if (language === 'id') {
      return {
        type: 'Proyek',
        duration: courseInfo.duration || '2 minggu',
        description:
          `${courseInfo.courseCode || ''} ${courseInfo.courseName || ''} Penilaian Proyek`.trim(),
      }
    }
    // English default
    return {
      type: 'Project',
      duration: courseInfo.duration || '2 weeks',
      description:
        `${courseInfo.courseCode || ''} ${courseInfo.courseName || ''} Project Assessment`.trim(),
    }
  }

  // For exam assessments, always set duration to 2 hours
  if (assessmentType.toLowerCase() === 'exam') {
    return {
      type: 'Exam',
      duration: '2 hours',
      // Ensure clean description without duplication
      description:
        `${courseInfo?.courseCode || ''} ${courseInfo?.courseName || ''} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`.trim(),
    }
  }

  // Determine if we have source materials
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')

  const systemPrompt =
    language === 'id'
      ? `${langDirective(language)}\n\nAnda adalah pengembang asesmen pendidikan ahli. Buat metadata untuk asesmen ${assessmentType} tingkat ${difficultyLevel} ${
          hasSourceMaterials
            ? 'berdasarkan SECARA KETAT materi sumber yang disediakan.'
            : `untuk ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'mata kuliah ini'}`
        }.

INSTRUKSI PENTING:
${
  hasSourceMaterials
    ? `1. Dasarkan seluruh konten pada materi sumber.
2. Ambil konsep kunci dan istilah langsung dari materi sumber.
3. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.`
    : `1. Dasarkan metadata pada standar kurikulum untuk ${
        courseInfo?.courseName || 'mata kuliah ini'
      }.
2. Fokus pada konsep inti dan tujuan asesmen.
3. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.`
}
3. Buat type, duration, dan description.
4. Respons HARUS berupa JSON valid.

FORMAT:
{
  "type": "${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)}",
  "duration": "Durasi yang sesuai (misal '2 hours')",
  "description": "Deskripsi singkat tujuan asesmen"
}

JANGAN sertakan teks di luar objek JSON.`
      : `${langDirective(language)}\n\nYou are an expert assessment designer. Create metadata for a ${difficultyLevel}-level ${assessmentType} assessment ${
          hasSourceMaterials
            ? 'STRICTLY based on the provided source materials.'
            : `for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}`
        }.

CRITICAL INSTRUCTIONS:
${
  hasSourceMaterials
    ? `1. Base all content on the source materials.
2. Use key concepts and terminology directly from the sources.
3. The output MUST be entirely in the requested target language with no language mixing.`
    : `1. Base the metadata on standard curriculum for ${courseInfo?.courseName || 'this course'}.
2. Focus on core concepts and purpose of the assessment.
3. The output MUST be entirely in the requested target language with no language mixing.`
}
3. Produce type, duration, and description.
4. The response MUST be valid JSON.

FORMAT:
{
  "type": "${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)}",
  "duration": "A suitable duration (e.g., '2 hours')",
  "description": "A brief description of the assessment purpose"
}

DO NOT include any text outside the JSON object.`

  const systemMessage: ModelMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: ModelMessage = {
    role: 'user',
    content:
      language === 'id'
        ? `Hasilkan metadata untuk asesmen ${assessmentType} pada ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'mata kuliah ini'}.`
        : `Generate metadata for the ${assessmentType} assessment in ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}.`,
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxOutputTokens: Math.floor(TOKEN_MAX / 4),
    })

    const cleaned = stripThinkTags(response.text)
    console.log('Metadata response:', cleaned)

    try {
      const metadata = JSON.parse(cleaned)
      console.log('Successfully parsed metadata directly')

      // Override duration for exam type
      if (assessmentType.toLowerCase() === 'exam') {
        metadata.duration = '2 hours'
      }

      // Ensure description is not duplicated if courseInfo is provided
      if (courseInfo?.courseCode && courseInfo?.courseName) {
        metadata.description = `${courseInfo.courseCode} ${courseInfo.courseName} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`
      }

      return metadata
    } catch {
      console.log('Direct parsing failed, trying JSON extraction')
    }

    const jsonStr = extractJsonFromText(cleaned)
    if (jsonStr) {
      try {
        const metadata = JSON.parse(jsonStr)
        console.log('Successfully extracted and parsed metadata JSON')

        // Override duration for exam type
        if (assessmentType.toLowerCase() === 'exam') {
          metadata.duration = '2 hours'
        }

        // Ensure description is not duplicated if courseInfo is provided
        if (courseInfo?.courseCode && courseInfo?.courseName) {
          metadata.description = `${courseInfo.courseCode} ${courseInfo.courseName} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`
        }

        return metadata
      } catch (e) {
        console.error('Failed to parse extracted metadata JSON:', e)
      }
    }

    // If all extraction methods fail, construct metadata from the response text
    console.log('Constructing metadata from response text')

    // Extract type from the response text
    let extractedType = assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)
    const typeMatch = cleaned.match(/"type"\s*:\s*"([^"]+)"/)
    if (typeMatch && typeMatch[1]) {
      extractedType = typeMatch[1]
    }

    // Extract duration from the response text, but override for exam type
    let extractedDuration =
      assessmentType.toLowerCase() === 'exam' ? '2 hours' : getDefaultDuration(assessmentType)
    if (assessmentType.toLowerCase() !== 'exam') {
      const durationMatch = cleaned.match(/"duration"\s*:\s*"([^"]+)"/)
      if (durationMatch && durationMatch[1]) {
        extractedDuration = durationMatch[1]
      }
    }

    // Extract description from the response text or use a clean one if courseInfo is provided
    let extractedDescription = `A ${difficultyLevel} level ${assessmentType} assessment.`
    if (courseInfo?.courseCode && courseInfo?.courseName) {
      extractedDescription = `${courseInfo.courseCode} ${courseInfo.courseName} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`
    } else {
      const descMatch = cleaned.match(/"description"\s*:\s*"([^"]+)"/)
      if (descMatch && descMatch[1]) {
        extractedDescription = descMatch[1]
      }
    }

    const constructedMetadata = {
      type: extractedType,
      duration: extractedDuration,
      description: extractedDescription,
    }

    console.log('Using constructed metadata:', constructedMetadata)
    return constructedMetadata
  } catch (error) {
    console.error('Error generating metadata:', error)

    // Return default metadata if generation fails
    const defaultMetadata = {
      type: assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1),
      duration:
        assessmentType.toLowerCase() === 'exam' ? '2 hours' : getDefaultDuration(assessmentType),
      description:
        courseInfo?.courseCode && courseInfo?.courseName
          ? `${courseInfo.courseCode} ${courseInfo.courseName} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`
          : `A ${difficultyLevel} level ${assessmentType} assessment.`,
    }

    console.log('Using default metadata due to error:', defaultMetadata)
    return defaultMetadata
  }
}

async function generateModelAnswer(
  question: string,
  assessmentType: string,
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo?: CourseInfo,
  language: 'en' | 'id' = 'en',
): Promise<string> {
  console.log(`Generating model answer for question: ${question.substring(0, 100)}...`)

  // Determine if we have source materials
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')

  // Choose prompts based on assessment type
  let systemMessage: ModelMessage
  let userMessage: ModelMessage

  if (assessmentType.toLowerCase() === 'project') {
    const projectPrompts = await import('./prompts/project')
    systemMessage = {
      role: 'system',
      content: projectPrompts.buildProjectModelAnswerSystemPrompt(
        courseInfo,
        language,
        hasSourceMaterials,
      ),
    }
    userMessage = {
      role: 'user',
      content: projectPrompts.buildProjectModelAnswerUserPrompt(
        question,
        courseInfo,
        language,
        hasSourceMaterials,
      ),
    }
  } else {
    const examPrompts = await import('./prompts/exam')
    systemMessage = {
      role: 'system',
      content: examPrompts.buildExamModelAnswerSystemPrompt(
        assessmentType,
        courseInfo,
        language,
        hasSourceMaterials,
        question,
      ),
    }
    userMessage = {
      role: 'user',
      content: examPrompts.buildExamModelAnswerUserPrompt(
        hasSourceMaterials && assessmentType.toLowerCase() === 'exam',
        courseInfo,
        language,
      ),
    }
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
    })

    let cleaned = stripThinkTags(response.text)

    // For project assessments, always ensure the language matches the selected language
    if (assessmentType.toLowerCase() === 'project') {
      cleaned = await ensureTargetLanguageText(cleaned, language, ollama, selectedModel)
      console.log('Project model answer language enforced')
    }

    console.log('Model answer response:', cleaned.substring(0, 100) + '...')
    return cleaned
  } catch (error) {
    console.error('Error generating model answer:', error)
    return `Unable to generate a model answer due to an error: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

async function generateMarkingCriteria(
  question: string,
  modelAnswer: string,
  assessmentType: string,
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo?: CourseInfo,
  language: 'en' | 'id' = 'en',
): Promise<ExplanationObject> {
  console.log(`Generating marking criteria for question: ${question.substring(0, 100)}...`)

  // Determine if we have source materials
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')

  // Use modular prompt builders for exam marking criteria
  const examPrompts = await import('./prompts/exam')
  const systemPrompt = examPrompts.buildExamMarkingCriteriaSystemPrompt(
    assessmentType,
    courseInfo,
    language,
    hasSourceMaterials,
    question,
    modelAnswer,
  )

  const systemMessage: ModelMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: ModelMessage = {
    role: 'user',
    content: examPrompts.buildExamMarkingCriteriaUserPrompt(
      hasSourceMaterials && assessmentType.toLowerCase() === 'exam',
      courseInfo,
      language,
    ),
  }

  try {
    // Prefer structured generation to minimize parsing errors
    try {
      const { object } = await generateObject({
        model: ollama(selectedModel),
        output: 'no-schema',
        messages: [systemMessage, assistantMessage, userMessage],
        temperature: TEMPERATURE,
        maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
        providerOptions: {
          ollama: {
            mode: 'json',
            options: {
              numCtx: TOKEN_RESPONSE_BUDGET,
            },
          },
        },
      })
      if (
        object &&
        typeof object === 'object' &&
        'criteria' in object &&
        'markAllocation' in object
      ) {
        console.log('Successfully generated marking criteria via generateObject')
        return object as ExplanationObject
      }
      console.log('generateObject returned unexpected shape, falling back to text parsing')
    } catch (e) {
      console.log('generateObject failed for marking criteria, falling back to generateText:', e)
    }

    // Fallback to text generation and robust parsing
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
    })

    const cleanedRaw = stripThinkTags(response.text)
    const cleaned = stripCodeFences(cleanedRaw)
    console.log('Marking criteria response:', cleaned.substring(0, 100) + '...')

    try {
      const markingCriteria = JSON.parse(cleaned)
      console.log('Successfully parsed marking criteria directly')
      return markingCriteria
    } catch {
      console.log('Direct parsing of marking criteria failed, trying JSON extraction')
    }

    const jsonStr = extractJsonFromText(cleaned)
    if (jsonStr) {
      try {
        const markingCriteria = JSON.parse(jsonStr)
        console.log('Successfully extracted and parsed marking criteria JSON')
        return markingCriteria
      } catch (e) {
        console.error('Failed to parse extracted marking criteria JSON:', e)
      }
    }

    // Last resort: try jsonrepair on the whole cleaned text
    try {
      let repaired: string
      try {
        repaired = jsonrepair(cleaned)
      } catch (e) {
        console.error('jsonrepair threw while repairing marking criteria:', e)
        throw e
      }
      const repairedObj = JSON.parse(repaired)
      console.log('Successfully repaired and parsed marking criteria JSON with jsonrepair')
      return repairedObj
    } catch (e) {
      console.error('jsonrepair failed to repair marking criteria JSON:', e)
    }

    // If all extraction methods fail, return default marking criteria
    console.log('Using default marking criteria due to parsing failure')
    return {
      criteria: [
        {
          name: 'Understanding of concepts',
          weight: 40,
          description: 'Demonstrates understanding of key concepts from the course',
        },
        {
          name: 'Application of knowledge',
          weight: 30,
          description: 'Applies knowledge to the specific context of the question',
        },
        {
          name: 'Critical analysis',
          weight: 30,
          description: 'Shows critical thinking and analysis of the subject matter',
        },
      ],
      markAllocation: [],
      error: 'Failed to generate marking criteria',
    }
  } catch (error) {
    console.error('Error generating marking criteria:', error)
    return {
      criteria: [
        {
          name: 'Understanding of concepts',
          weight: 40,
          description: 'Demonstrates understanding of key concepts from the course',
        },
        {
          name: 'Application of knowledge',
          weight: 30,
          description: 'Applies knowledge to the specific context of the question',
        },
        {
          name: 'Critical analysis',
          weight: 30,
          description: 'Shows critical thinking and analysis of the subject matter',
        },
      ],
      markAllocation: [],
      error: error instanceof Error ? error.message : 'Unknown error during criteria generation',
    }
  }
}

// Helper: strip <think>...</think> sections before parsing or sending to frontend
function stripThinkTags(text: string): string {
  if (!text) return text
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // remove enclosed content
    .replace(/<\/?think>/gi, '') // safety: stray tags
    .trim()
}

// Update the processQuestion function to better handle project assessments
async function processQuestion(
  questionText: GeneratedQuestion,
  assessmentType: string,
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  questionIndex: number,
  courseInfo?: CourseInfo,
  language: 'en' | 'id' = 'en',
): Promise<AssessmentQuestion> {
  // Handle case where questionText might be an object instead of a string
  let questionString: string
  let questionType = ''

  if (typeof questionText === 'object') {
    // If it's an object, extract the relevant text
    questionType = questionText.type || ''
    questionString = questionText.question || JSON.stringify(questionText)

    console.log(`Processing ${assessmentType} question ${questionIndex + 1}:`, {
      type: questionType,
      description: questionString.substring(0, 100) + '...',
    })
  } else {
    // If it's already a string, use it directly
    questionString = questionText
    console.log(
      `Processing ${assessmentType} question ${questionIndex + 1}: ${questionString.substring(0, 100)}...`,
    )
  }

  try {
    // Special handling for project assessments
    if (assessmentType.toLowerCase() === 'project') {
      console.log('Processing project assessment question...')

      // For project assessments, we need to generate a model answer and rubric
      const modelAnswer = await generateModelAnswer(
        questionString,
        assessmentType,
        difficultyLevel,
        ollama,
        selectedModel,
        assistantMessage,
        courseInfo,
        language,
      )

      // Get the default project rubric
      const projectRubric = await generateProjectRubric(
        difficultyLevel,
        ollama,
        selectedModel,
        assistantMessage,
        courseInfo || { courseName: 'Project Assessment' }, // Use courseInfo if provided
        language,
      )

      // Localized labels for project components
      const labels =
        language === 'id'
          ? {
              report: 'Laporan',
              demo: 'Presentasi Demo',
              individual: 'Kontribusi Individu',
              reportDesc: 'Komponen laporan tertulis',
              demoDesc: 'Komponen presentasi',
              individualDesc: 'Komponen penilaian individu',
              levels: {
                excellent: 'Sangat Baik (5)',
                good: 'Baik (4)',
                average: 'Sedang (3)',
              },
            }
          : {
              report: 'Report',
              demo: 'Demo',
              individual: 'Individual Contribution',
              reportDesc: 'Written report component',
              demoDesc: 'Presentation component',
              individualDesc: 'Individual assessment component',
              levels: {
                excellent: 'Excellent (5)',
                good: 'Good (4)',
                average: 'Average (3)',
              },
            }

      // Return the project assessment question with the model answer and rubric
      return {
        question: questionString,
        correctAnswer: modelAnswer,
        explanation: {
          criteria: [
            ...projectRubric.categories.report.map((c) => ({
              name: `${labels.report} - ${c.name}`,
              weight: c.weight,
              description: c.description,
            })),
            ...projectRubric.categories.demo.map((c) => ({
              name: `${labels.demo} - ${c.name}`,
              weight: c.weight,
              description: c.description,
            })),
            ...projectRubric.categories.individual.map((c) => ({
              name: `${labels.individual} - ${c.name}`,
              weight: c.weight,
              description: c.description,
            })),
          ],
          markAllocation: [
            {
              component: labels.report,
              marks: projectRubric.reportWeight,
              description: labels.reportDesc,
            },
            {
              component: labels.demo,
              marks: projectRubric.demoWeight,
              description: labels.demoDesc,
            },
            {
              component: labels.individual,
              marks: projectRubric.individualWeight,
              description: labels.individualDesc,
            },
          ],
          rubricLevels: [
            {
              level: labels.levels.excellent,
              criteria: Object.fromEntries(
                [
                  ...projectRubric.categories.report,
                  ...projectRubric.categories.demo,
                  ...projectRubric.categories.individual,
                ]
                  .filter((c) => c.levels?.excellent)
                  .map((c) => [c.name, c.levels?.excellent || '']),
              ),
            },
            {
              level: labels.levels.good,
              criteria: Object.fromEntries(
                [
                  ...projectRubric.categories.report,
                  ...projectRubric.categories.demo,
                  ...projectRubric.categories.individual,
                ]
                  .filter((c) => c.levels?.good)
                  .map((c) => [c.name, c.levels?.good || '']),
              ),
            },
            {
              level: labels.levels.average,
              criteria: Object.fromEntries(
                [
                  ...projectRubric.categories.report,
                  ...projectRubric.categories.demo,
                  ...projectRubric.categories.individual,
                ]
                  .filter((c) => c.levels?.average)
                  .map((c) => [c.name, c.levels?.average || '']),
              ),
            },
          ],
          markingScale: projectRubric.markingScale,
        },
        // Add the type if it was present in the original question
        ...(questionType ? { type: questionType } : {}),
      }
    }

    // For non-project assessments, proceed with the standard approach
    // Step 2: Generate model answer (with timeout and fallback)
    console.log(`Generating model answer for ${assessmentType} question...`)
    const modelAnswer = await withTimeout(
      generateModelAnswer(
        questionString,
        assessmentType,
        difficultyLevel,
        ollama,
        selectedModel,
        assistantMessage,
        courseInfo,
        language,
      ),
      ASSESSMENT_REQUEST_TIMEOUT_MS,
      async () =>
        language === 'id'
          ? 'Jawaban model tidak tersedia karena batas waktu.'
          : 'Model answer unavailable due to timeout.',
    )

    // Step 3: Generate marking criteria (with timeout and fallback)
    console.log(`Generating marking criteria for ${assessmentType} question...`)
    const markingCriteria = await withTimeout(
      generateMarkingCriteria(
        questionString,
        modelAnswer,
        assessmentType,
        difficultyLevel,
        ollama,
        selectedModel,
        assistantMessage,
        courseInfo,
        language,
      ),
      ASSESSMENT_REQUEST_TIMEOUT_MS,
      async () => {
        if (language === 'id') {
          return {
            criteria: [
              {
                name: 'Pemahaman konsep',
                weight: 40,
                description: 'Menunjukkan pemahaman konsep kunci dari mata kuliah',
              },
              {
                name: 'Penerapan pengetahuan',
                weight: 30,
                description: 'Menerapkan pengetahuan pada konteks spesifik pertanyaan',
              },
              {
                name: 'Analisis kritis',
                weight: 30,
                description: 'Menunjukkan pemikiran kritis dan analisis materi',
              },
            ],
            markAllocation: [],
            error: 'Kriteria penilaian default digunakan karena batas waktu.',
          }
        }
        return {
          criteria: [
            {
              name: 'Understanding of concepts',
              weight: 40,
              description: 'Demonstrates understanding of key concepts from the course',
            },
            {
              name: 'Application of knowledge',
              weight: 30,
              description: 'Applies knowledge to the specific context of the question',
            },
            {
              name: 'Critical analysis',
              weight: 30,
              description: 'Shows critical thinking and analysis of the subject matter',
            },
          ],
          markAllocation: [],
          error: 'Default marking criteria used due to timeout.',
        }
      },
    )

    // Step 4: Combine into a complete question
    return {
      question: questionString,
      correctAnswer: modelAnswer,
      explanation: markingCriteria,
      // Add the type if it was present in the original question
      ...(questionType ? { type: questionType } : {}),
    }
  } catch (error) {
    console.error(`Error processing ${assessmentType} question ${questionIndex + 1}:`, error)

    // Return a fallback question with error information
    return {
      question: questionString,
      correctAnswer: `Unable to generate a model answer due to an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      explanation: {
        criteria: [
          {
            name: 'Understanding of concepts',
            weight: 40,
            description: 'Demonstrates understanding of key concepts from the course',
          },
          {
            name: 'Application of knowledge',
            weight: 30,
            description: 'Applies knowledge to the specific context of the question',
          },
          {
            name: 'Critical analysis',
            weight: 30,
            description: 'Shows critical thinking and analysis of the subject matter',
          },
        ],
        markAllocation: [],
        error: error instanceof Error ? error.message : 'Unknown error during criteria generation',
      },
    }
  }
}

// Update the main POST handler to ensure metadata is correctly passed
export async function POST(req: Request) {
  try {
    const {
      selectedModel,
      selectedSources,
      assessmentType,
      difficultyLevel,
      numQuestions,
      courseInfo,
      language = 'en',
    } = await req.json()

    if (!assessmentType || !difficultyLevel) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    console.log('=== ASSESSMENT GENERATION STARTED ===')
    console.log('Parameters:', { assessmentType, difficultyLevel, numQuestions })
    console.log('Course Info:', courseInfo)
    console.log('Selected Sources Raw:', selectedSources)
    console.log('Selected Sources Type:', typeof selectedSources)
    console.log('Selected Sources Array?:', Array.isArray(selectedSources))

    // Selected sources handling: if items include an explicit `selected` flag, use it;
    // otherwise, treat any non-empty array as selected (backward compatibility with clients
    // that only send selected items without the flag)
    let hasSelectedSources = false
    let effectiveSources: ClientSource[] = []
    if (Array.isArray(selectedSources) && selectedSources.length > 0) {
      const anyHasSelectedFlag = selectedSources.some((s: ClientSource) => 'selected' in s)
      effectiveSources = anyHasSelectedFlag
        ? (selectedSources as ClientSource[]).filter((s) => s.selected)
        : (selectedSources as ClientSource[])
      hasSelectedSources = effectiveSources.length > 0
    }

    console.log(
      'Selected sources count:',
      hasSelectedSources ? effectiveSources.length : 'No sources selected',
    )
    console.log(
      'Effective sources:',
      effectiveSources.map((s) => ({ id: s.id, name: s.name, selected: s.selected })),
    )

    // Get the Ollama URL from environment variables
    const ollamaUrl = process.env.OLLAMA_URL
    if (!ollamaUrl) {
      throw new Error('OLLAMA_URL is not defined in environment variables.')
    }

    // Create Ollama client
    const ollama = createOllama({ baseURL: ollamaUrl + '/api' })

    // Prepare source content
    let assistantContent = ''

    try {
      // Only retrieve chunks if there are selected sources
      if (hasSelectedSources) {
        // Use the getStoredChunks function to retrieve chunks from selected sources
        console.log(
          'Attempting to retrieve chunks for sources:',
          effectiveSources.map((s) => s.id),
        )
        const retrievedChunks = await getStoredChunks(effectiveSources)
        console.log('Retrieved chunks:', retrievedChunks.length)
        console.log('Retrieved chunks sample:', retrievedChunks.slice(0, 2))
        console.log(
          'First few chunks preview:',
          retrievedChunks.slice(0, 3).map((c) => ({
            sourceId: c.sourceId,
            chunkLength: c.chunk?.length || 0,
            chunkPreview: c.chunk?.substring(0, 100) + '...',
            sourceType: c.sourceType,
            hasSourceName: !!c.sourceName,
          })),
        )

        if (retrievedChunks.length > 0) {
          // Process chunks to create a structured context
          let structuredContent = 'SOURCE MATERIALS:\n\n'

          // Group chunks by source
          const sourceGroups = new Map<string, ChunkWithSourceName[]>()

          retrievedChunks.forEach((chunk) => {
            const chunkObj = chunk as unknown as ChunkWithSourceName
            const sourceName = chunkObj.sourceName || 'Unknown Source'
            if (!sourceGroups.has(sourceName)) {
              sourceGroups.set(sourceName, [])
            }
            sourceGroups.get(sourceName)!.push(chunkObj)
          })

          // Format chunks by source for better context
          let chunkIndex = 1
          for (const [sourceName, chunks] of sourceGroups.entries()) {
            structuredContent += `SOURCE: ${sourceName}\n\n`

            // Sort chunks by order if available
            const sortedChunks = [...chunks].sort((a, b) =>
              a.order !== undefined && b.order !== undefined ? a.order - b.order : 0,
            )

            // For large chunk sets, prioritize the first chunks which typically contain introduction/overview
            const chunksToInclude = sortedChunks.slice(0, Math.min(sortedChunks.length, 50))
            console.log(
              `Including ${chunksToInclude.length} chunks out of ${sortedChunks.length} total chunks for source: ${sourceName}`,
            )

            chunksToInclude.forEach((chunkObj) => {
              structuredContent += `EXCERPT ${chunkIndex}:\n${chunkObj.chunk}\n\n`
              chunkIndex++
            })

            structuredContent += '---\n\n'
          }

          // If the content is too large, we need to summarize it to fit within context window
          if (countTokens(structuredContent) > TOKEN_CONTEXT_BUDGET) {
            console.log(
              `Content too large (${countTokens(structuredContent)} tokens), truncating to fit context window (${TOKEN_CONTEXT_BUDGET} tokens)`,
            )
            const originalContent = structuredContent
            structuredContent = truncateToTokenLimit(structuredContent, TOKEN_CONTEXT_BUDGET)
            console.log('Original content length:', originalContent.length)
            console.log('Truncated content length:', structuredContent.length)
            console.log('Truncated content preview:', structuredContent.substring(0, 500) + '...')
          } else {
            console.log(
              `Content fits within context budget (${countTokens(structuredContent)} tokens <= ${TOKEN_CONTEXT_BUDGET} tokens)`,
            )
          }

          console.log(`Final context size: ${countTokens(structuredContent)} tokens`)
          console.log('Structured content preview:', structuredContent.substring(0, 500) + '...')
          console.log(
            'Structured content includes SOURCE MATERIALS marker:',
            structuredContent.includes('SOURCE MATERIALS:'),
          )
          assistantContent = `${langDirective(language)}\n\n${structuredContent}`
          console.log(
            'Final assistantContent includes SOURCE MATERIALS:',
            assistantContent.includes('SOURCE MATERIALS:'),
          )
          console.log('Final assistantContent length:', assistantContent.length)
        } else {
          console.log('No chunks retrieved despite having selected sources')
        }
      }

      // Handle case where sources were selected but assistantContent is still empty
      if (hasSelectedSources && !assistantContent) {
        // Sources were selected but produced zero chunks; still indicate SOURCE MATERIALS to prevent course-title fallback
        console.log(
          'Sources selected but no chunks retrieved; setting minimal SOURCE MATERIALS context',
        )
        assistantContent = `${langDirective(language)}\n\nSOURCE MATERIALS:\n\n` // minimal marker to trigger source-only behavior in downstream prompts
      }

      // If no sources were selected, use a course-specific prompt
      if (!hasSelectedSources) {
        console.log('No sources selected, using course-specific prompt')
        if (courseInfo?.courseCode && courseInfo?.courseName) {
          assistantContent =
            language === 'id'
              ? `${langDirective(language)}\n\nHasilkan asesmen ${assessmentType} tingkat ${difficultyLevel} untuk mata kuliah "${courseInfo.courseCode} ${courseInfo.courseName}".

Sebagai ahli di bidang ini, buat konten yang sesuai untuk tingkat universitas.

Untuk asesmen ${assessmentType} ini:
1. Sertakan pertanyaan yang menguji pemahaman konsep inti ${courseInfo.courseName}
2. Cakup berbagai topik yang umum dalam kurikulum ${courseInfo.courseName}
3. Sesuaikan tingkat kesulitan untuk tingkat ${difficultyLevel}
4. Gabungkan aspek teoritis dan praktis jika relevan
5. Pastikan pertanyaan jelas, tidak ambigu, dan akademik.
`
              : `${langDirective(language)}\n\nGenerate a ${assessmentType} assessment at ${difficultyLevel} level for the course "${courseInfo.courseCode} ${courseInfo.courseName}".

As an expert in the field, create content suitable for a university context.

For this ${assessmentType} assessment:
1. Include questions that test understanding of core ${courseInfo.courseName} concepts.
2. Cover a range of topics commonly found in the ${courseInfo.courseName} curriculum.
3. Calibrate difficulty to the ${difficultyLevel} level.
4. Combine theoretical and practical aspects where relevant.
5. Ensure questions are clear, unambiguous, and academic in tone.
`
        } else {
          assistantContent =
            language === 'id'
              ? `${langDirective(language)}\n\nHasilkan asesmen ${assessmentType} tingkat ${difficultyLevel} berdasarkan pengetahuan kurikulum standar untuk mata kuliah ini.

Instruksi:
1. Gunakan konsep inti dan teori umum.
2. Pastikan keragaman topik.
3. Jaga konsistensi tingkat kesulitan.
`
              : `${langDirective(language)}\n\nGenerate a ${assessmentType} assessment at ${difficultyLevel} level based on standard curriculum knowledge for this course.

Instructions:
1. Use core concepts and common theories.
2. Ensure a diversity of topics.
3. Maintain consistent difficulty.
`
        }
      }
    } catch (error) {
      console.error('Error retrieving knowledge:', error)
      // Handle error case: if sources were selected, maintain SOURCE MATERIALS context
      if (hasSelectedSources) {
        console.log(
          'Error retrieving sources but sources were selected; setting minimal SOURCE MATERIALS context',
        )
        assistantContent = `${langDirective(language)}\n\nSOURCE MATERIALS:\n\n` // minimal marker to trigger source-only behavior
      } else {
        // Use course-specific prompt only when no sources were selected
        if (courseInfo?.courseCode && courseInfo?.courseName) {
          assistantContent =
            language === 'id'
              ? `${langDirective(language)}\n\nHasilkan asesmen ${assessmentType} tingkat ${difficultyLevel} untuk mata kuliah "${courseInfo.courseCode} ${courseInfo.courseName}".

Sebagai ahli di bidang ini, buat konten yang sesuai untuk tingkat universitas.

Untuk asesmen ${assessmentType} ini:
1. Sertakan pertanyaan yang menguji pemahaman konsep inti ${courseInfo.courseName}
2. Cakup berbagai topik yang umum dalam kurikulum ${courseInfo.courseName}
3. Sesuaikan tingkat kesulitan untuk tingkat ${difficultyLevel}
4. Gabungkan aspek teoritis dan praktis jika relevan
5. Pastikan pertanyaan jelas, tidak ambigu, dan akademik.
`
              : `${langDirective(language)}\n\nGenerate a ${assessmentType} assessment at ${difficultyLevel} level for the course "${courseInfo.courseCode} ${courseInfo.courseName}".

As an expert in the field, create content suitable for a university context.

For this ${assessmentType} assessment:
1. Include questions that test understanding of core ${courseInfo.courseName} concepts.
2. Cover a range of topics commonly found in the ${courseInfo.courseName} curriculum.
3. Calibrate difficulty to the ${difficultyLevel} level.
4. Combine theoretical and practical aspects where relevant.
5. Ensure questions are clear, unambiguous, and academic in tone.
`
        } else {
          assistantContent =
            language === 'id'
              ? `${langDirective(language)}\n\nHasilkan asesmen ${assessmentType} tingkat ${difficultyLevel} berdasarkan pengetahuan kurikulum standar untuk mata kuliah ini.

Instruksi:
1. Gunakan konsep inti dan teori umum.
2. Pastikan keragaman topik.
3. Jaga konsistensi tingkat kesulitan.
`
              : `${langDirective(language)}\n\nGenerate a ${assessmentType} assessment at ${difficultyLevel} level based on standard curriculum knowledge for this course.

Instructions:
1. Use core concepts and common theories.
2. Ensure a diversity of topics.
3. Maintain consistent difficulty.
`
        }
      }
    }

    // Create assistant message with the source content
    const assistantMessage: ModelMessage = {
      role: 'assistant',
      content: assistantContent,
    }

    console.log('=== ASSISTANT MESSAGE CONTENT DEBUG ===')
    console.log('Assistant content length:', assistantContent.length)
    console.log('Contains SOURCE MATERIALS:', assistantContent.includes('SOURCE MATERIALS:'))
    console.log('Language directive present:', assistantContent.includes(langDirective(language)))
    console.log('Assistant content preview:', assistantContent.substring(0, 300) + '...')
    console.log('=== END ASSISTANT MESSAGE DEBUG ===')

    // Generate assessment metadata using the new function
    const assessmentMetadata = await generateAssessmentMetadata(
      assessmentType,
      difficultyLevel,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
      language,
    )

    console.log('Final metadata:', assessmentMetadata)

    // Step 1: Generate unique questions
    const questionTexts = await generateQuestions(
      assessmentType,
      difficultyLevel,
      numQuestions,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
      language,
    )

    console.log(`Generated ${questionTexts.length} unique questions`)

    // Step 5: Process each question with limited concurrency to reduce total latency
    const generatedQuestions: AssessmentQuestion[] = await mapWithConcurrency(
      questionTexts,
      ASSESSMENT_CONCURRENCY,
      async (q, i) => {
        const processed = await processQuestion(
          q,
          assessmentType,
          difficultyLevel,
          ollama,
          selectedModel,
          assistantMessage,
          i,
          courseInfo,
          language,
        )
        console.log(`Completed processing question ${i + 1} of ${questionTexts.length}`)
        return processed
      },
    )

    console.log(`Successfully processed ${generatedQuestions.length} questions`)

    // Step 6: Combine metadata and questions into the final assessment
    const assessmentData = {
      assessmentIdeas: [
        {
          type:
            assessmentMetadata.type ||
            assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1),
          duration: assessmentMetadata.duration || getDefaultDuration(assessmentType),
          description:
            assessmentMetadata.description ||
            `A ${difficultyLevel} level ${assessmentType} assessment.`,
          exampleQuestions: generatedQuestions,
          courseCode: courseInfo?.courseCode,
          courseName: courseInfo?.courseName,
        },
      ],
    }

    console.log('=== ASSESSMENT GENERATION COMPLETED ===')

    // Return the assessment data to the frontend
    return NextResponse.json(assessmentData)
  } catch (error: unknown) {
    console.error('Error generating assessment:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: 'Failed to generate assessment: ' + errorMessage,
        details: error instanceof Error ? error.stack : 'No stack trace available',
      },
      { status: 500 },
    )
  }
}
