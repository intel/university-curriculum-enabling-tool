// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers'
import type { ModelMessage } from 'ai'
import type { AssessmentQuestion } from '@/lib/types/assessment-types'

// Import modularized utilities and generators
import { ASSESSMENT_CONCURRENCY, getDefaultDuration } from './config/constants'
import { mapWithConcurrency } from './utils/generalHelpers'
import { generateQuestions } from './generators/questionsGenerator'
import { generateAssessmentMetadata } from './generators/metadataGenerator'
import { processQuestion } from './processors/questionProcessor'
import { prepareSourceContent } from './services/sourceContentService'

export const dynamic = 'force-dynamic'

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

    // Get the provider instance (supports both Ollama and OVMS)
    const provider = getProvider()

    // Prepare source content using the modularized service
    const assistantContent = await prepareSourceContent(selectedSources, courseInfo, language)

    // Create assistant message with the source content
    const assistantMessage: ModelMessage = {
      role: 'assistant',
      content: assistantContent,
    }

    console.log('=== ASSISTANT MESSAGE CONTENT DEBUG ===')
    console.log('Assistant content length:', assistantContent.length)
    console.log('Contains SOURCE MATERIALS:', assistantContent.includes('SOURCE MATERIALS:'))
    console.log('Assistant content preview:', assistantContent.substring(0, 300) + '...')
    console.log('=== END ASSISTANT MESSAGE DEBUG ===')

    // Generate assessment metadata using the modularized generator
    const assessmentMetadata = await generateAssessmentMetadata(
      assessmentType,
      difficultyLevel,
      provider,
      selectedModel,
      assistantMessage,
      courseInfo,
      language,
    )

    console.log('Final metadata:', assessmentMetadata)

    // Step 1: Generate unique questions using the modularized generator
    const questionTexts = await generateQuestions(
      assessmentType,
      difficultyLevel,
      numQuestions,
      provider,
      selectedModel,
      assistantMessage,
      courseInfo,
      language,
    )

    console.log(`Generated ${questionTexts.length} unique questions`)

    // Step 2: Process each question with limited concurrency to reduce total latency
    const generatedQuestions: AssessmentQuestion[] = await mapWithConcurrency(
      questionTexts,
      ASSESSMENT_CONCURRENCY,
      async (q, i) => {
        const processed = await processQuestion(
          q,
          assessmentType,
          difficultyLevel,
          provider,
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

    // Step 3: Combine metadata and questions into the final assessment
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
