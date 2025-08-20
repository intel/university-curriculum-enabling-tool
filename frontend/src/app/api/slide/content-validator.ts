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
    title: typedContent.title || 'Untitled Content',
    learningOutcomes: Array.isArray(typedContent.learningOutcomes)
      ? (typedContent.learningOutcomes as string[])
      : [],
    keyTerms: Array.isArray(typedContent.keyTerms)
      ? typedContent.keyTerms.map((item: unknown) => {
          const keyTermItem = item as Record<string, unknown>
          return {
            term: (keyTermItem?.term as string) || '',
            definition: (keyTermItem?.definition as string) || '',
          }
        })
      : [],
    introduction: typedContent.introduction || '',
    slides: Array.isArray(typedContent.slides)
      ? typedContent.slides.map((slide: unknown) => {
          const slideItem = slide as Record<string, unknown>
          return {
            title: (slideItem?.title as string) || 'Untitled Slide',
            content: Array.isArray(slideItem?.content) ? slideItem.content : [],
            notes: (slideItem?.notes as string) || '',
          }
        })
      : [],
    activities: Array.isArray(typedContent.activities)
      ? typedContent.activities.map((activity: unknown) => {
          const activityItem = activity as Record<string, unknown>
          return {
            title: (activityItem?.title as string) || 'Untitled Activity',
            type: (activityItem?.type as string) || 'Activity',
            description: (activityItem?.description as string) || '',
            duration: (activityItem?.duration as string) || '15 minutes',
            instructions: Array.isArray(activityItem?.instructions)
              ? activityItem.instructions
              : [],
            materials: Array.isArray(activityItem?.materials) ? activityItem.materials : [],
          }
        })
      : [],
    assessmentIdeas: Array.isArray(typedContent.assessmentIdeas)
      ? typedContent.assessmentIdeas.map((idea: unknown) => {
          if (typeof idea === 'string') {
            // Convert string to object format
            return {
              type: 'Assessment',
              duration: 'Varies',
              description: idea,
              exampleQuestions: [],
            }
          } else if (typeof idea === 'object' && idea !== null) {
            const ideaItem = idea as Record<string, unknown>
            return {
              type: (ideaItem.type as string) || 'Assessment',
              duration: (ideaItem.duration as string) || 'Varies',
              description: (ideaItem.description as string) || '',
              exampleQuestions: Array.isArray(ideaItem.exampleQuestions)
                ? ideaItem.exampleQuestions.map((q: unknown) => {
                    const questionItem = q as Record<string, unknown>

                    // Properly handle explanation - ensure it's either string, object with properties, or undefined
                    let explanation: string | { [key: string]: unknown } | undefined = undefined
                    if (
                      typeof questionItem.explanation === 'string' &&
                      questionItem.explanation.trim() !== ''
                    ) {
                      explanation = questionItem.explanation
                    } else if (
                      typeof questionItem.explanation === 'object' &&
                      questionItem.explanation !== null &&
                      Object.keys(questionItem.explanation).length > 0
                    ) {
                      explanation = questionItem.explanation as { [key: string]: unknown }
                    }

                    return {
                      question: (questionItem.question as string) || '',
                      options: Array.isArray(questionItem.options)
                        ? (questionItem.options as unknown[]).filter(
                            (opt): opt is string => typeof opt === 'string',
                          )
                        : undefined,
                      correctAnswer: (questionItem.correctAnswer as string) || '',
                      explanation,
                      pointAllocation: (questionItem.pointAllocation as string) || '1 point',
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
      ? typedContent.furtherReadings.map((reading: unknown) => {
          if (typeof reading === 'string') {
            // Convert string to object format
            return {
              title: 'Recommended Reading',
              author: 'Various',
              readingDescription: reading,
            }
          } else if (typeof reading === 'object' && reading !== null) {
            const readingItem = reading as Record<string, unknown>
            return {
              title: (readingItem.title as string) || 'Recommended Reading',
              author: (readingItem.author as string) || 'Various',
              readingDescription: (readingItem.readingDescription as string) || '',
            }
          }
          return {
            title: 'Recommended Reading',
            author: 'Various',
            readingDescription: 'Reading details not provided',
          }
        })
      : [],
    contentType: finalContentType,
    difficultyLevel: difficultyLevel,
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
