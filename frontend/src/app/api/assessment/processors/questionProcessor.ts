// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { ModelMessage } from 'ai'
import type { OllamaFn, GeneratedQuestion } from '../types/assessment.types'
import type { CourseInfo } from '@/lib/types/course-info-types'
import type { AssessmentQuestion } from '@/lib/types/assessment-types'
import { ASSESSMENT_REQUEST_TIMEOUT_MS, createDefaultMarkingCriteria } from '../config/constants'
import { withTimeout } from '../utils/generalHelpers'
import {
  generateModelAnswer,
  generateMarkingCriteria,
} from '../generators/answerAndCriteriaGenerator'
import { generateProjectRubric } from '../generators/rubricGenerator'

// Update the processQuestion function to better handle project assessments
export async function processQuestion(
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
      async () =>
        createDefaultMarkingCriteria(
          language,
          language === 'id'
            ? 'Kriteria penilaian default digunakan karena batas waktu.'
            : 'Default marking criteria used due to timeout.',
        ),
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
      explanation: createDefaultMarkingCriteria(
        language,
        error instanceof Error ? error.message : 'Unknown error during criteria generation',
      ),
    }
  }
}
