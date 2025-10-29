// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { generateText, type ModelMessage } from 'ai'
import type { OllamaFn } from '../types/assessment.types'
import type { ProjectRubricCriterion } from '@/lib/types/project-rubric-criterion'
import {
  TEMPERATURE,
  TOKEN_RESPONSE_BUDGET,
  LANGUAGE_ENFORCEMENT_TEMPERATURE_DECREASE,
  RUBRIC_TOKEN_BUDGET_DIVISOR,
} from '../config/constants'
import { extractJsonFromText } from './jsonHelpers'
import { stripThinkTags, logAssessmentDebug } from './generalHelpers'

// Heuristic language detection for English vs Bahasa Indonesia
export function detectLikelyLanguage(text: string): 'en' | 'id' | 'unknown' {
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
export async function ensureTargetLanguageText(
  text: string,
  language: 'en' | 'id',
  ollama: OllamaFn,
  selectedModel: string,
  options?: { force?: boolean },
): Promise<string> {
  const detected = detectLikelyLanguage(text)

  // Only skip enforcement if content is already in the target language
  if (detected === language) {
    logAssessmentDebug(`Content already in target language (${language}), skipping enforcement`)
    return text
  }

  // If force is enabled, always enforce regardless of detection result
  // If force is disabled and detection is unknown, skip enforcement
  if (detected === 'unknown' && !options?.force) {
    logAssessmentDebug('Language unknown and force not enabled, skipping enforcement')
    return text
  }

  // If we reach here, we need to enforce the language
  logAssessmentDebug(
    `Enforcing language: detected=${detected}, target=${language}, force=${options?.force || false}`,
  )

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
      temperature: Math.max(0, TEMPERATURE - LANGUAGE_ENFORCEMENT_TEMPERATURE_DECREASE),
      maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
    })
    const result = stripThinkTags(resp.text)
    logAssessmentDebug('Language enforcement completed successfully')
    return result
  } catch (error) {
    console.error('Language enforcement failed:', error)
    return text
  }
}

// Decide if a rubric array likely needs language enforcement based on a small sample
export function needLanguageEnforcementForCriteria(
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
export async function enforceRubricLanguage(
  criteria: ProjectRubricCriterion[],
  language: 'en' | 'id',
  ollama: OllamaFn,
  selectedModel: string,
): Promise<ProjectRubricCriterion[]> {
  const langDirective =
    language === 'id'
      ? 'PENTING: Semua output harus dalam Bahasa Indonesia yang jelas dan alami.'
      : 'IMPORTANT: All output must be in clear and natural English.'

  const directive =
    language === 'id'
      ? `${langDirective}\n\nTugas: Ubah SEMUA nilai string di dalam array JSON berikut menjadi Bahasa Indonesia yang jelas dan alami.\nJANGAN ubah kunci, bentuk array, urutan item, tipe data numerik, atau bobot.\nKembalikan HANYA JSON (array) dengan struktur yang sama.`
      : `${langDirective}\n\nTask: Rewrite ALL string values in the following JSON array into clear and natural English.\nDO NOT change keys, array shape, item order, numeric types, or weights.\nReturn JSON ONLY (the array) with exactly the same structure.`

  const systemMessage: ModelMessage = { role: 'system', content: directive }
  const userMessage: ModelMessage = { role: 'user', content: JSON.stringify(criteria) }

  try {
    const resp = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, userMessage],
      temperature: Math.max(0, TEMPERATURE - LANGUAGE_ENFORCEMENT_TEMPERATURE_DECREASE),
      maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET / RUBRIC_TOKEN_BUDGET_DIVISOR),
    })
    const cleaned = stripThinkTags(resp.text)
    const jsonStr = extractJsonFromText(cleaned) || cleaned
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed)) return parsed as ProjectRubricCriterion[]
  } catch (e) {
    logAssessmentDebug('Batch rubric language enforcement failed, returning original criteria:', e)
  }
  return criteria
}
