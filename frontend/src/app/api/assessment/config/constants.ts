// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { DefaultCriteriaTemplate } from '../types/assessment.types'
import type { ExplanationObject } from '@/lib/types/assessment-types'

// Configuration constants
export const TEMPERATURE = (() => {
  const temp = Number.parseFloat(process.env.RAG_TEMPERATURE || '0.1')
  return Number.isNaN(temp) ? 0.1 : temp
})()
export const TOKEN_MAX = Number.parseInt(process.env.RAG_TOKEN_MAX ?? '2048')
export const TOKEN_RESPONSE_RATIO = Number.parseFloat(
  process.env.RESPONSE_TOKEN_PERCENTAGE || '0.7',
)
export const TOKEN_RESPONSE_BUDGET = Math.floor(TOKEN_MAX * TOKEN_RESPONSE_RATIO)
export const TOKEN_CONTEXT_BUDGET = 1200 // Increased to allow more source content while keeping response budget reasonable
export const ASSESSMENT_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.ASSESSMENT_CONCURRENCY || '3'),
)
export const ASSESSMENT_REQUEST_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(process.env.ASSESSMENT_REQUEST_TIMEOUT_MS || '210000'),
)
export const ASSESSMENT_DEBUG_LOGS = process.env.ASSESSMENT_DEBUG_LOGS === 'true'

// Temperature adjustments for specific generators
// Project descriptions benefit from slightly higher temperature for more creative/varied output
export const PROJECT_DESCRIPTION_TEMPERATURE_INCREASE = 0.1
// Language enforcement uses slightly lower temperature for more precise translation/rewriting
export const LANGUAGE_ENFORCEMENT_TEMPERATURE_DECREASE = 0.05

// Token budget adjustments
// Rubric language enforcement uses smaller token budget (1/4 of response budget)
export const RUBRIC_TOKEN_BUDGET_DIVISOR = 4

// Source content processing
// Maximum number of chunks to include per source (prioritizes first chunks with intro/overview)
export const MAX_CHUNKS_PER_SOURCE = 50

// Language directive helper
export const langDirective = (lang: 'en' | 'id') =>
  lang === 'id'
    ? 'PENTING: Semua output harus dalam Bahasa Indonesia yang jelas dan alami.'
    : 'IMPORTANT: All output must be in clear and natural English.'

// Default criteria templates
export const DEFAULT_CRITERIA_TEMPLATES: Record<'en' | 'id', DefaultCriteriaTemplate> = {
  en: {
    criteria: [
      {
        name: 'Conceptual Understanding',
        weight: 40,
        description: 'Demonstrates understanding of key concepts from the course',
      },
      {
        name: 'Application of Knowledge',
        weight: 30,
        description: 'Applies knowledge to the specific context of the question',
      },
      {
        name: 'Analytical Depth',
        weight: 20,
        description: 'Provides logical reasoning, calculations, or derivations where appropriate',
      },
      {
        name: 'Communication Quality',
        weight: 10,
        description: 'Presents the answer clearly with correct terminology and units',
      },
    ],
    markAllocation: [
      {
        component: 'Conceptual Understanding',
        marks: 40,
        description:
          'Award up to 40 marks for accurately identifying and explaining the governing concepts.',
      },
      {
        component: 'Application of Knowledge',
        marks: 30,
        description:
          'Award up to 30 marks for applying the concepts to the specific scenario with correct assumptions.',
      },
      {
        component: 'Analytical Depth',
        marks: 20,
        description:
          'Award up to 20 marks for detailed calculations, derivations, and clear logical steps.',
      },
      {
        component: 'Communication Quality',
        marks: 10,
        description:
          'Award up to 10 marks for clear presentation, proper notation, and concise justification.',
      },
    ],
  },
  id: {
    criteria: [
      {
        name: 'Pemahaman Konsep',
        weight: 40,
        description: 'Menunjukkan pemahaman terhadap konsep kunci dari mata kuliah',
      },
      {
        name: 'Penerapan Pengetahuan',
        weight: 30,
        description: 'Menerapkan pengetahuan pada konteks pertanyaan secara tepat',
      },
      {
        name: 'Kedalaman Analisis',
        weight: 20,
        description: 'Memberikan penalaran logis, perhitungan, atau derivasi yang relevan',
      },
      {
        name: 'Kualitas Komunikasi',
        weight: 10,
        description: 'Menyajikan jawaban dengan jelas menggunakan istilah dan satuan yang benar',
      },
    ],
    markAllocation: [
      {
        component: 'Pemahaman Konsep',
        marks: 40,
        description:
          'Berikan hingga 40 poin untuk penjelasan yang tepat tentang konsep-konsep utama.',
      },
      {
        component: 'Penerapan Pengetahuan',
        marks: 30,
        description:
          'Berikan hingga 30 poin untuk penerapan konsep ke skenario yang diberikan secara benar.',
      },
      {
        component: 'Kedalaman Analisis',
        marks: 20,
        description:
          'Berikan hingga 20 poin untuk langkah analisis, perhitungan, dan argumentasi yang rinci.',
      },
      {
        component: 'Kualitas Komunikasi',
        marks: 10,
        description:
          'Berikan hingga 10 poin untuk penyajian jawaban yang jelas, notasi tepat, dan bahasa yang rapi.',
      },
    ],
  },
}

// Create default marking criteria
export const createDefaultMarkingCriteria = (
  language: 'en' | 'id',
  reason?: string,
): ExplanationObject => {
  const template = DEFAULT_CRITERIA_TEMPLATES[language] ?? DEFAULT_CRITERIA_TEMPLATES.en
  const payload: ExplanationObject = {
    criteria: template.criteria.map((item) => ({ ...item })),
    markAllocation: template.markAllocation.map((item) => ({ ...item })),
  }
  if (reason) {
    payload.error = reason
  }
  return payload
}

// Get default duration for assessment types
export const getDefaultDuration = (assessmentType: string): string => {
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
