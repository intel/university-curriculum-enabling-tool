// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { LectureContent } from './types'

// Interface for the input content that may be partially formed
interface PartialContent {
  title?: string
  contentType?: string
  learningOutcomes?: unknown[]
  keyTerms?: unknown[]
  introduction?: string
  slides?: unknown[]
  activities?: unknown[]
  assessmentIdeas?: unknown[]
  furtherReadings?: unknown[]
  [key: string]: unknown
}

// Size limits guard against oversized/deeply-nested model output reaching the
// PPTX/PDF generators (T11: document and archive injection).
const MAX_TITLE_LENGTH = 300
const MAX_TEXT_LENGTH = 20_000
const MAX_SLIDES = 80
const MAX_ACTIVITIES = 40
const MAX_ASSESSMENT_IDEAS = 30
const MAX_QUESTIONS_PER_IDEA = 50
const MAX_KEY_TERMS = 150
const MAX_FURTHER_READINGS = 80
const MAX_LEARNING_OUTCOMES = 100
const MAX_LIST_ITEMS = 100

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const UNSAFE_URI_SCHEME_RE = /\b(javascript|vbscript|data):/gi

// Model/document content is untrusted: strip control characters and neutralize
// script-like URI schemes before the text reaches any generated file.
function sanitizeText(value: unknown, maxLength: number = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string') return ''
  const cleaned = value.replace(CONTROL_CHARS_RE, '').replace(UNSAFE_URI_SCHEME_RE, 'blocked-uri:')
  return cleaned.slice(0, maxLength)
}

function sanitizeTextArray(
  value: unknown,
  maxItems: number = MAX_LIST_ITEMS,
  maxLength: number = MAX_TEXT_LENGTH,
): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .slice(0, maxItems)
    .map((item) => sanitizeText(item, maxLength))
}

function limitItems<T>(value: T[], maxItems: number): T[] {
  return value.slice(0, maxItems)
}

// Validate and sanitize the combined response
export function validateAndSanitizeContent(
  content: unknown,
  contentType: string,
  difficultyLevel: string,
): LectureContent {
  // Type assertion for the content parameter
  const typedContent = content as PartialContent
  // Determine content type from the response or use the provided default
  const finalContentType = typedContent.contentType || contentType

  // Create a sanitized version with defaults for any missing properties
  const sanitized: LectureContent = {
    title: sanitizeText(typedContent.title, MAX_TITLE_LENGTH) || 'Untitled Content',
    learningOutcomes: sanitizeTextArray(typedContent.learningOutcomes, MAX_LEARNING_OUTCOMES),
    keyTerms: Array.isArray(typedContent.keyTerms)
      ? limitItems(typedContent.keyTerms, MAX_KEY_TERMS).map((item: unknown) => {
          const keyTermItem = item as Record<string, unknown>
          return {
            term: sanitizeText(keyTermItem?.term, MAX_TITLE_LENGTH),
            definition: sanitizeText(keyTermItem?.definition),
          }
        })
      : [],
    introduction: sanitizeText(typedContent.introduction),
    slides: Array.isArray(typedContent.slides)
      ? limitItems(typedContent.slides, MAX_SLIDES).map((slide: unknown) => {
          const slideItem = slide as Record<string, unknown>
          return {
            title: sanitizeText(slideItem?.title, MAX_TITLE_LENGTH) || 'Untitled Slide',
            content: sanitizeTextArray(slideItem?.content),
            notes: sanitizeText(slideItem?.notes),
          }
        })
      : [],
    activities: Array.isArray(typedContent.activities)
      ? limitItems(typedContent.activities, MAX_ACTIVITIES).map((activity: unknown) => {
          const activityItem = activity as Record<string, unknown>
          return {
            title: sanitizeText(activityItem?.title, MAX_TITLE_LENGTH) || 'Untitled Activity',
            type: sanitizeText(activityItem?.type, 100) || 'Activity',
            description: sanitizeText(activityItem?.description),
            duration: sanitizeText(activityItem?.duration, 100) || '15 minutes',
            instructions: sanitizeTextArray(activityItem?.instructions),
            materials: sanitizeTextArray(activityItem?.materials),
          }
        })
      : [],
    assessmentIdeas: Array.isArray(typedContent.assessmentIdeas)
      ? limitItems(typedContent.assessmentIdeas, MAX_ASSESSMENT_IDEAS).map((idea: unknown) => {
          if (typeof idea === 'string') {
            // Convert string to object format
            return {
              type: 'Assessment',
              duration: 'Varies',
              description: sanitizeText(idea),
              exampleQuestions: [],
            }
          } else if (typeof idea === 'object' && idea !== null) {
            const ideaItem = idea as Record<string, unknown>
            return {
              type: sanitizeText(ideaItem.type, 100) || 'Assessment',
              duration: sanitizeText(ideaItem.duration, 100) || 'Varies',
              description: sanitizeText(ideaItem.description),
              exampleQuestions: Array.isArray(ideaItem.exampleQuestions)
                ? limitItems(ideaItem.exampleQuestions, MAX_QUESTIONS_PER_IDEA).map((q: unknown) => {
                    const questionItem = q as Record<string, unknown>

                    // Properly handle explanation - ensure it's either string, object with properties, or undefined
                    let explanation: string | { [key: string]: unknown } | undefined = undefined
                    if (
                      typeof questionItem.explanation === 'string' &&
                      questionItem.explanation.trim() !== ''
                    ) {
                      explanation = sanitizeText(questionItem.explanation)
                    } else if (
                      typeof questionItem.explanation === 'object' &&
                      questionItem.explanation !== null &&
                      Object.keys(questionItem.explanation).length > 0
                    ) {
                      explanation = questionItem.explanation as { [key: string]: unknown }
                    }

                    return {
                      question: sanitizeText(questionItem.question),
                      options: Array.isArray(questionItem.options)
                        ? sanitizeTextArray(questionItem.options)
                        : undefined,
                      correctAnswer: sanitizeText(questionItem.correctAnswer, MAX_TITLE_LENGTH),
                      explanation,
                      pointAllocation: sanitizeText(questionItem.pointAllocation, 100) || '1 point',
                    }
                  })
                : [],
            }
          }
          return {
            type: 'Assessment',
            duration: 'Varies',
            description: 'Assessment details not provided',
            exampleQuestions: [],
          }
        })
      : [],
    furtherReadings: Array.isArray(typedContent.furtherReadings)
      ? limitItems(typedContent.furtherReadings, MAX_FURTHER_READINGS).map((reading: unknown) => {
          if (typeof reading === 'string') {
            // Convert string to object format
            return {
              title: 'Recommended Reading',
              author: 'Various',
              readingDescription: sanitizeText(reading),
            }
          } else if (typeof reading === 'object' && reading !== null) {
            const readingItem = reading as Record<string, unknown>
            return {
              title: sanitizeText(readingItem.title, MAX_TITLE_LENGTH) || 'Recommended Reading',
              author: sanitizeText(readingItem.author, MAX_TITLE_LENGTH) || 'Various',
              readingDescription: sanitizeText(readingItem.readingDescription),
            }
          }
          return {
            title: 'Recommended Reading',
            author: 'Various',
            readingDescription: 'Reading details not provided',
          }
        })
      : [],
    contentType: sanitizeText(finalContentType, 50),
    difficultyLevel: sanitizeText(difficultyLevel, 50),
  }

  // Ensure we have at least 5 slides for lecture content
  if (finalContentType === 'lecture' && sanitized.slides.length < 5) {
    const additionalSlidesNeeded = 5 - sanitized.slides.length
    for (let i = 0; i < additionalSlidesNeeded; i++) {
      sanitized.slides.push({
        title: `Additional Slide ${i + 1}`,
        content: ['This slide was added to meet the minimum requirement of 5 slides.'],
        notes: 'Please add content to this slide based on your course materials.',
      })
    }
  }

  // For workshop and tutorial content types, ensure we have proper activities
  if (finalContentType === 'workshop' || finalContentType === 'tutorial') {
    // If no activities were provided but we have slides, convert slides to activities
    if (
      sanitized.activities.length === 0 &&
      Array.isArray(typedContent.slides) &&
      typedContent.slides.length > 0
    ) {
      sanitized.activities = typedContent.slides.map((slide: unknown, index: number) => {
        const slideItem = slide as Record<string, unknown>
        const slideTitle =
          typeof slideItem.title === 'string' ? slideItem.title : `Activity ${index + 1}`
        const slideContent = Array.isArray(slideItem.content) ? slideItem.content : []
        const slideNotes = typeof slideItem.notes === 'string' ? slideItem.notes : ''

        return {
          title: slideTitle,
          type: finalContentType === 'workshop' ? 'Group work' : 'Exercise',
          description: slideContent.join(' '),
          duration: '15 minutes',
          instructions: slideContent,
          materials: ['Computers or laptops', 'Reference materials'],
          notes: slideNotes,
        }
      })
    }

    // Ensure we have at least one activity for workshop/tutorial
    if (sanitized.activities.length === 0) {
      sanitized.activities = [
        {
          title: `Sample ${finalContentType === 'workshop' ? 'Workshop Activity' : 'Tutorial Exercise'}`,
          type: finalContentType === 'workshop' ? 'Group work' : 'Exercise',
          description: `A sample ${finalContentType} activity related to the topic.`,
          duration: '15 minutes',
          instructions: [
            'Step 1: Review the material',
            'Step 2: Complete the exercise',
            'Step 3: Share your findings or solutions',
          ],
          materials: ['Computers or laptops', 'Reference materials'],
        },
      ]
    }
  }

  // Enhanced validation for tutorial content
  if (finalContentType === 'tutorial') {
    // Ensure each activity has clear instructions and success criteria
    sanitized.activities = sanitized.activities.map((activity) => {
      // Add success criteria if not present
      if (
        !activity.description.includes('success criteria') &&
        !activity.description.includes("you will know you've succeeded")
      ) {
        activity.description +=
          "\n\nSuccess criteria: Students will know they've succeeded when they can complete the task independently and explain their process."
      }

      // Ensure instructions are numbered and clear
      if (activity.instructions.length > 0) {
        activity.instructions = activity.instructions.map((instruction, idx) => {
          // If instruction doesn't start with a number, add step number
          if (!/^\d+\.|\bStep \d+:/.test(instruction)) {
            return `Step ${idx + 1}: ${instruction}`
          }
          return instruction
        })
      }

      return activity
    })
  }

  // Enhanced validation for workshop content
  if (finalContentType === 'workshop') {
    // Ensure each activity has facilitation notes and group dynamics guidance
    sanitized.activities = sanitized.activities.map((activity) => {
      // Add facilitation notes if not present in the description
      if (
        !activity.description.includes('facilitation') &&
        !activity.description.includes('facilitator')
      ) {
        activity.description +=
          '\n\nFacilitation notes: Monitor group progress, encourage equal participation, and be prepared to provide guidance if groups get stuck.'
      }

      if (
        Array.isArray(activity.materials) &&
        !activity.materials.some(
          (m) => typeof m === 'string' && (m.includes('group') || m.includes('team')),
        )
      ) {
        activity.materials.push(
          'Instructions for forming groups (e.g., count off, random assignment, or self-selection)',
        )
      }

      return activity
    })
  }

  return sanitized
}
