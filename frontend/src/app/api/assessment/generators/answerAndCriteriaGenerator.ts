// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { generateText, generateObject, type ModelMessage } from 'ai'
import { jsonrepair } from 'jsonrepair'
import { z } from 'zod'
import type { ProviderFn } from '../types/assessment.types'
import type { CourseInfo } from '@/lib/types/course-info-types'
import type { ExplanationObject } from '@/lib/types/assessment-types'
import {
  TEMPERATURE,
  TOKEN_RESPONSE_BUDGET,
  createDefaultMarkingCriteria,
} from '../config/constants'
import { extractJsonFromText } from '../utils/jsonHelpers'
import { stripThinkTags, stripCodeFences } from '../utils/generalHelpers'
import { ensureTargetLanguageText } from '../utils/languageHelpers'

// Zod schema for marking criteria (inline for OVMS compatibility)
const explanationObjectSchema = z.object({
  criteria: z.array(
    z.object({
      name: z.string(),
      weight: z.number(),
      description: z.string().optional(),
    }),
  ),
  markAllocation: z.array(
    z.object({
      component: z.string(),
      marks: z.number(),
      description: z.string().optional(),
    }),
  ),
})

export async function generateModelAnswer(
  question: string,
  assessmentType: string,
  difficultyLevel: string,
  provider: ProviderFn,
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
    const projectPrompts = await import('../prompts/project')
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
    const examPrompts = await import('../prompts/exam')
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
    // First attempt with full context
    try {
      const response = await generateText({
        model: provider(selectedModel),
        messages: [systemMessage, assistantMessage, userMessage],
        temperature: TEMPERATURE,
        maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
      })

      let cleaned = stripThinkTags(response.text)

      // Always ensure the language matches the selected language for both exam and project assessments
      // Use force: true to ensure enforcement even if detection is uncertain
      cleaned = await ensureTargetLanguageText(cleaned, language, provider, selectedModel, {
        force: true,
      })
      console.log('Model answer language enforced to', language)

      cleaned = cleaned.replace(/^[ \t]*[\*-]\s+/gm, '• ')
      console.log('Model answer response:', cleaned.substring(0, 100) + '...')
      return cleaned
    } catch (firstError) {
      console.warn('First attempt failed, trying with reduced context:', firstError)

      // Retry with reduced context (simplified assistant message for bilingual scenarios)
      const reducedContent =
        hasSourceMaterials && language !== 'en'
          ? `Generate answer in ${language === 'id' ? 'Bahasa Indonesia' : 'the target language'}.`
          : typeof assistantMessage.content === 'string'
            ? assistantMessage.content
            : ''

      const reducedAssistantMessage: ModelMessage = {
        role: 'assistant',
        content: reducedContent,
      }

      const response = await generateText({
        model: provider(selectedModel),
        messages: [systemMessage, reducedAssistantMessage, userMessage],
        temperature: TEMPERATURE,
        maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET * 0.8), // Reduce output budget
      })

      let cleaned = stripThinkTags(response.text)

      // Always ensure the language matches the selected language for both exam and project assessments
      // Use force: true to ensure enforcement even if detection is uncertain
      cleaned = await ensureTargetLanguageText(cleaned, language, provider, selectedModel, {
        force: true,
      })
      console.log('Model answer language enforced to', language, '(retry)')

      cleaned = cleaned.replace(/^[ \t]*[\*-]\s+/gm, '• ')
      console.log('Model answer response (retry):', cleaned.substring(0, 100) + '...')
      return cleaned
    }
  } catch (error) {
    console.error('Error generating model answer:', error)

    // Provide a more helpful error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const fallbackAnswer =
      language === 'id'
        ? `Tidak dapat menghasilkan jawaban model karena keterbatasan konteks. Pertanyaan: ${question.substring(0, 200)}...\n\nSilakan coba dengan sumber materi yang lebih sedikit atau gunakan bahasa Inggris.`
        : `Unable to generate a model answer due to context limitations. Question: ${question.substring(0, 200)}...\n\nPlease try with fewer source materials or use English as the response language.`

    console.log('Using fallback answer due to error:', errorMessage)
    return fallbackAnswer
  }
}

// Helper function to enforce language on marking criteria object
async function enforceLanguageOnMarkingCriteria(
  criteria: ExplanationObject,
  language: 'en' | 'id',
  provider: ProviderFn,
  selectedModel: string,
): Promise<ExplanationObject> {
  try {
    // Enforce language on criteria array
    if (criteria.criteria && Array.isArray(criteria.criteria)) {
      criteria.criteria = await Promise.all(
        criteria.criteria.map(async (c) => ({
          ...c,
          name: await ensureTargetLanguageText(c.name, language, provider, selectedModel, {
            force: true,
          }),
          description: c.description
            ? await ensureTargetLanguageText(c.description, language, provider, selectedModel, {
                force: true,
              })
            : c.description,
        })),
      )
    }

    // Enforce language on markAllocation array
    if (criteria.markAllocation && Array.isArray(criteria.markAllocation)) {
      criteria.markAllocation = await Promise.all(
        criteria.markAllocation.map(async (m) => ({
          ...m,
          component: await ensureTargetLanguageText(
            m.component,
            language,
            provider,
            selectedModel,
            {
              force: true,
            },
          ),
          description: m.description
            ? await ensureTargetLanguageText(m.description, language, provider, selectedModel, {
                force: true,
              })
            : m.description,
        })),
      )
    }

    console.log('Language enforcement completed for marking criteria')
  } catch (error) {
    console.error('Error enforcing language on marking criteria:', error)
  }

  return criteria
}

export async function generateMarkingCriteria(
  question: string,
  modelAnswer: string,
  assessmentType: string,
  difficultyLevel: string,
  provider: ProviderFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo?: CourseInfo,
  language: 'en' | 'id' = 'en',
): Promise<ExplanationObject> {
  console.log(`Generating marking criteria for question: ${question.substring(0, 100)}...`)

  // Determine if we have source materials
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')

  // Use modular prompt builders for exam marking criteria
  const examPrompts = await import('../prompts/exam')
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
    let object: unknown
    let retryWithReducedContext = false

    try {
      const result = await generateObject({
        model: provider(selectedModel),
        schema: explanationObjectSchema,
        messages: [systemMessage, assistantMessage, userMessage],
        temperature: TEMPERATURE,
        maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
      })
      object = result.object
    } catch (e) {
      console.log(
        'generateObject failed for marking criteria, will try reduced context or fallback:',
        e,
      )
      retryWithReducedContext = true
    }

    // Retry with reduced context if first attempt failed
    if (retryWithReducedContext) {
      try {
        const reducedContent =
          hasSourceMaterials && language !== 'en'
            ? `Generate marking criteria in ${language === 'id' ? 'Bahasa Indonesia' : 'the target language'}.`
            : typeof assistantMessage.content === 'string'
              ? assistantMessage.content
              : ''

        const reducedAssistantMessage: ModelMessage = {
          role: 'assistant',
          content: reducedContent,
        }

        const result = await generateObject({
          model: provider(selectedModel),
          schema: explanationObjectSchema,
          messages: [systemMessage, reducedAssistantMessage, userMessage],
          temperature: TEMPERATURE,
          maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET * 0.8),
        })
        object = result.object
        console.log('Successfully generated marking criteria with reduced context')
      } catch (retryError) {
        console.log(
          'Retry with reduced context also failed, falling back to text generation:',
          retryError,
        )
      }
    }

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

    // Fallback to text generation and robust parsing
    let response
    try {
      response = await generateText({
        model: provider(selectedModel),
        messages: [systemMessage, assistantMessage, userMessage],
        temperature: TEMPERATURE,
        maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
      })
    } catch (textError) {
      console.warn('Text generation failed, trying with reduced context:', textError)

      // Retry with reduced context
      const reducedContent =
        hasSourceMaterials && language !== 'en'
          ? `Generate marking criteria in ${language === 'id' ? 'Bahasa Indonesia' : 'the target language'}.`
          : typeof assistantMessage.content === 'string'
            ? assistantMessage.content
            : ''

      const reducedAssistantMessage: ModelMessage = {
        role: 'assistant',
        content: reducedContent,
      }

      response = await generateText({
        model: provider(selectedModel),
        messages: [systemMessage, reducedAssistantMessage, userMessage],
        temperature: TEMPERATURE,
        maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET * 0.8),
      })
    }

    const cleanedRaw = stripThinkTags(response.text)
    const cleaned = stripCodeFences(cleanedRaw)
    console.log('Marking criteria response:', cleaned.substring(0, 100) + '...')

    try {
      const markingCriteria = JSON.parse(cleaned)
      console.log('Successfully parsed marking criteria directly')
      // Enforce language on the marking criteria text fields
      const enforced = await enforceLanguageOnMarkingCriteria(
        markingCriteria,
        language,
        provider,
        selectedModel,
      )
      return enforced
    } catch {
      console.log('Direct parsing of marking criteria failed, trying JSON extraction')
    }

    const jsonStr = extractJsonFromText(cleaned)
    if (jsonStr) {
      try {
        const markingCriteria = JSON.parse(jsonStr)
        console.log('Successfully extracted and parsed marking criteria JSON')
        // Enforce language on the marking criteria text fields
        const enforced = await enforceLanguageOnMarkingCriteria(
          markingCriteria,
          language,
          provider,
          selectedModel,
        )
        return enforced
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
      // Enforce language on the marking criteria text fields
      const enforced = await enforceLanguageOnMarkingCriteria(
        repairedObj,
        language,
        provider,
        selectedModel,
      )
      return enforced
    } catch (e) {
      console.error('jsonrepair failed to repair marking criteria JSON:', e)
    }

    // If all extraction methods fail, return default marking criteria
    console.log('Using default marking criteria due to parsing failure')
    return createDefaultMarkingCriteria(language, 'Failed to generate marking criteria')
  } catch (error) {
    console.error('Error generating marking criteria:', error)
    return createDefaultMarkingCriteria(
      language,
      error instanceof Error ? error.message : 'Unknown error during criteria generation',
    )
  }
}
