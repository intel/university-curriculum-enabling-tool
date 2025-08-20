// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOllama } from 'ollama-ai-provider'
import { type CoreMessage, generateObject } from 'ai'
import { NextResponse } from 'next/server'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'
import { errorResponse } from '@/lib/api-response'
import type { ClientSource } from '@/lib/types/client-source'
import type { StudyPlan } from '@/lib/types/study-plan'
import type { ContextChunk } from '@/lib/types/context-chunk'

export const dynamic = 'force-dynamic'

// Configuration constants
const TEMPERATURE = Number.parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const TOKEN_MAX = Number.parseInt(process.env.RAG_TOKEN_MAX ?? '2048')
const TOKEN_RESPONSE_RATIO = Number.parseFloat(process.env.RESPONSE_TOKEN_PERCENTAGE || '0.7')
const TOKEN_RESPONSE_BUDGET = Math.floor(TOKEN_MAX * TOKEN_RESPONSE_RATIO)
const TOKEN_CONTEXT_BUDGET = Math.floor(TOKEN_MAX * (1 - TOKEN_RESPONSE_RATIO))

// Helper function to count tokens (simple approximation)
function countTokens(text: string): number {
  return text.split(/\s+/).length
}

// Helper function to truncate text to fit within token limit
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

// Helper function to get learning style prompt
function getLearningStylePrompt(style: string): string {
  const stylePrompts = {
    visual: `
      - Include visual learning activities like diagrams, mind maps, and videos
      - Recommend color-coding notes and using visual organizers
      - Suggest visualization techniques for complex concepts
      - Include resources with strong visual components
    `,
    auditory: `
      - Emphasize discussion groups, audio recordings, and verbal repetition
      - Suggest reading material aloud and recording key concepts
      - Include podcast recommendations and audio resources
      - Recommend verbal explanations to others as a study technique
    `,
    'reading/writing': `
      - Focus on reading materials, written summaries, and note-taking
      - Suggest rewriting concepts in different words
      - Recommend creating written outlines and structured notes
      - Include activities that involve writing essays or explanations
    `,
    kinesthetic: `
      - Include hands-on activities and practical applications
      - Suggest movement during study sessions
      - Recommend building models or physical representations
      - Include role-playing or simulation activities
    `,
    balanced: `
      - Provide a mix of visual, auditory, reading/writing, and kinesthetic activities
      - Balance theoretical learning with practical applications
      - Include diverse resource types to engage multiple learning modalities
      - Suggest varied study techniques that engage different senses
    `,
  }

  return stylePrompts[style as keyof typeof stylePrompts] || stylePrompts.balanced
}

// Helper function to get difficulty level prompt
function getDifficultyLevelPrompt(level: string): string {
  const difficultyPrompts = {
    beginner: `
      - Start with fundamental concepts and basic terminology
      - Break complex topics into smaller, manageable parts
      - Include more explanatory resources and introductory materials
      - Allocate more time for foundational topics
      - Provide clear, step-by-step instructions for activities
    `,
    intermediate: `
      - Build on basic concepts with more detailed information
      - Include some challenging materials that require deeper analysis
      - Balance theory with practical applications
      - Assume familiarity with fundamental concepts
      - Include activities that require connecting multiple concepts
    `,
    advanced: `
      - Focus on complex, nuanced aspects of the subject
      - Include advanced resources and challenging materials
      - Emphasize critical analysis and synthesis of information
      - Assume strong foundational knowledge
      - Include activities that require applying concepts in novel ways
    `,
  }

  return (
    difficultyPrompts[level as keyof typeof difficultyPrompts] || difficultyPrompts.intermediate
  )
}

export async function POST(req: Request) {
  try {
    const {
      selectedModel,
      selectedSources,
      studyPeriodWeeks,
      studyHoursPerWeek,
      examDate,
      difficultyLevel,
      learningStyle,
      courseCode,
      courseName,
    } = await req.json()

    console.log('Data from request:', {
      selectedModel,
      selectedSources,
      studyPeriodWeeks,
      studyHoursPerWeek,
      examDate,
      difficultyLevel,
      learningStyle,
      courseCode,
      courseName,
    })

    const ollamaUrl = process.env.OLLAMA_URL
    if (!ollamaUrl) {
      throw new Error('OLLAMA_URL is not defined in environment variables.')
    }
    const ollama = createOllama({ baseURL: ollamaUrl + '/api' })

    // Get specific prompts for learning style and difficulty level
    const learningStylePrompt = getLearningStylePrompt(learningStyle)
    const difficultyLevelPrompt = getDifficultyLevelPrompt(difficultyLevel)

    // Prepare source content
    let assistantContent = ''

    try {
      // Check if there are selected sources
      const hasSelectedSources =
        selectedSources &&
        Array.isArray(selectedSources) &&
        selectedSources.filter((s: ClientSource) => s.selected).length > 0

      if (hasSelectedSources) {
        // Use the getStoredChunks function to retrieve chunks from selected sources
        const retrievedChunks = await getStoredChunks(selectedSources)
        console.log('Retrieved chunks:', retrievedChunks.length)

        if (retrievedChunks.length > 0) {
          // Process chunks to create a structured context
          let structuredContent = 'SOURCE MATERIALS:\n\n'

          // Group chunks by source
          const sourceGroups = new Map<string, ContextChunk[]>()

          retrievedChunks.forEach((chunk) => {
            const sourceName = chunk.sourceName || 'Unknown Source'
            if (!sourceGroups.has(sourceName)) {
              sourceGroups.set(sourceName, [])
            }
            sourceGroups.get(sourceName)!.push(chunk)
          })

          // Format chunks by source for better context
          let chunkIndex = 1
          for (const [sourceName, chunks] of sourceGroups.entries()) {
            structuredContent += `SOURCE: ${sourceName}\n\n`

            // Sort chunks by order if available
            const sortedChunks = [...chunks].sort((a, b) =>
              a.order !== undefined && b.order !== undefined ? a.order - b.order : 0,
            )

            sortedChunks.forEach((chunkObj) => {
              structuredContent += `EXCERPT ${chunkIndex}:\n${chunkObj.chunk}\n\n`
              chunkIndex++
            })

            structuredContent += '---\n\n'
          }

          // If the content is too large, we need to summarize it to fit within context window
          if (countTokens(structuredContent) > TOKEN_CONTEXT_BUDGET) {
            console.log(
              `Content too large (${countTokens(structuredContent)} tokens), summarizing to fit context window`,
            )
            structuredContent = truncateToTokenLimit(structuredContent, TOKEN_CONTEXT_BUDGET)
          }

          console.log(`Final context size: ${countTokens(structuredContent)} tokens`)
          assistantContent = structuredContent
        }
      }

      // If no sources were selected or no chunks were retrieved, use a course-specific prompt
      if (!assistantContent) {
        console.log('No source content available, using course-specific prompt')
        // Replace the generic prompt with a course-specific one
        if (courseName) {
          assistantContent = `Generate a ${difficultyLevel} level study plan for the course "${courseCode ? courseCode + ' ' : ''}${courseName}".
          
As an expert educational consultant, create a comprehensive study plan that would be appropriate for a university-level course on this topic.
          
For this study plan:
1. Include topics that cover core concepts in ${courseName}
2. Cover a range of topics typically included in a ${courseName} curriculum
3. Ensure the difficulty level is appropriate for ${difficultyLevel} students
4. Include both theoretical and practical aspects of the subject where appropriate
5. Tailor the study techniques and activities to the ${learningStyle} learning style
6. Structure the plan across ${studyPeriodWeeks} weeks with ${studyHoursPerWeek} hours per week
${examDate ? `7. Prepare the student for an exam on ${examDate}` : ''}

The study plan should reflect standard academic expectations for a course with this title at university level.`
        } else {
          assistantContent =
            'No relevant knowledge found. Generate a study plan based on general knowledge of the subject.'
        }
      }
    } catch (error) {
      console.error('Error retrieving knowledge:', error)
      assistantContent =
        'An error occurred while retrieving knowledge. Generate a study plan based on general knowledge of the subject.'
    }

    // Create assistant message with the source content
    const assistantMessage: CoreMessage = {
      role: 'assistant',
      content: assistantContent,
    }

    // Enhanced system prompt with detailed instructions
    const studyPlanSystemPrompt = `You are a professional educational consultant specializing in creating personalized study plans. Create a comprehensive study plan based on the provided content.

LEARNING STYLE: ${learningStyle.toUpperCase()}
${learningStylePrompt}

DIFFICULTY LEVEL: ${difficultyLevel.toUpperCase()}
${difficultyLevelPrompt}

STUDY PARAMETERS:
- Study period: ${studyPeriodWeeks} weeks
- Available study time: ${studyHoursPerWeek} hours per week
${examDate ? `- Target exam date: ${examDate}` : '- No specific exam date'}

${
  assistantContent.includes('SOURCE MATERIALS:')
    ? `IMPORTANT: Base your study plan ENTIRELY on the provided source materials. Extract key concepts, terminology, examples, and explanations directly from the source materials. Do not introduce concepts or information that is not present in the source materials.`
    : `Note: No specific source materials were provided. Create a general study plan based on standard curriculum for this subject.`
}

CRITICAL INSTRUCTIONS FOR JSON RESPONSE:
You MUST return a valid JSON object with EXACTLY this structure and no additional fields:

{
  "executiveSummary": "Brief overview of the study plan that mentions the learning style, difficulty level, and key focus areas",
  "topicBreakdown": [
    {
      "topic": "Topic name",
      "subtopics": ["Subtopic 1", "Subtopic 2"],
      "importance": "High/Medium/Low",
      "estimatedStudyHours": 10
    }
  ],
  "weeklySchedule": [
    {
      "week": 1,
      "focus": "Week's focus",
      "topics": ["Topic 1", "Topic 2"],
      "activities": [
        {
          "type": "Reading/Practice/Review/Quiz",
          "description": "Detailed activity description",
          "duration": "2 hours",
          "resources": "Specific resources for this activity"
        }
      ],
      "milestones": ["Specific achievement to reach by end of week", "Another milestone"]
    }
  ],
  "studyTechniques": [
    {
      "technique": "Technique name",
      "description": "Detailed technique description",
      "bestFor": ["Specific use case", "Another use case"],
      "example": "Concrete example of how to apply this technique"
    }
  ],
  "additionalResources": [
    {
      "type": "Book/Video/Website/Tool",
      "name": "Resource name",
      "description": "Description of the resource and how it helps",
      "relevantTopics": ["Topic 1", "Topic 2"]
    }
  ],
  "practiceStrategy": {
    "approach": "Overall practice approach",
    "frequency": "Recommended practice frequency",
    "questionTypes": ["Multiple choice", "Short answer", "Problem solving"],
    "selfAssessment": "Methods to assess progress"
  },
  "examPreparation": {
    "finalWeekPlan": "Detailed plan for the final week of study",
    "dayBeforeExam": "Specific recommendations for the day before",
    "examDayTips": "Tips for exam day performance"
  }
}

IMPORTANT RULES:
1. Your response MUST be ONLY the JSON object with no additional text, markdown, or explanations
2. All fields in the JSON structure are REQUIRED - do not omit any fields
3. All arrays must be properly formatted with square brackets and comma-separated values
4. All strings must be properly quoted
5. Generate exactly ${studyPeriodWeeks} weeks in weeklySchedule
6. Distribute ${studyHoursPerWeek} hours per week across activities
7. Ensure activities align with the ${learningStyle} learning style
8. Match content difficulty to ${difficultyLevel} level
9. Make all explanations clear and actionable
10. Ensure milestones are measurable and achievable
11. Provide concrete examples for all study techniques
12. Do not add any fields that are not in the template above
13. Do not include any comments or explanations outside the JSON structure`

    const systemMessage: CoreMessage = {
      role: 'system',
      content: studyPlanSystemPrompt,
    }

    const userMessage: CoreMessage = {
      role: 'user',
      content: `Generate a comprehensive study plan based on the provided content. Tailor it for a ${difficultyLevel} level student with a ${learningStyle} learning style preference, spanning ${studyPeriodWeeks} weeks with ${studyHoursPerWeek} hours available per week.`,
    }

    console.log('Generating study plan with Ollama...')
    const startTime = Date.now()
    try {
      const { object: studyPlan } = await generateObject({
        model: ollama(selectedModel, { numCtx: TOKEN_MAX }),
        output: 'no-schema',
        messages: [systemMessage, assistantMessage, userMessage],
        temperature: TEMPERATURE,
        maxTokens: TOKEN_RESPONSE_BUDGET,
        mode: 'json',
      })

      // End timing and calculate the time taken
      const endTime = Date.now()
      const timeTakenSeconds = (endTime - startTime) / 1000

      console.log(`Generation completed in ${timeTakenSeconds.toFixed(2)} seconds`)

      // Type assertion to treat the response as a partial StudyPlan
      const rawPlan = studyPlan as Partial<StudyPlan>

      // Create a simplified cleaned plan with validation to ensure all required fields exist
      const cleanedPlan: StudyPlan = {
        executiveSummary:
          rawPlan.executiveSummary || 'A personalized study plan tailored to your learning needs.',
        topicBreakdown: Array.isArray(rawPlan.topicBreakdown) ? rawPlan.topicBreakdown : [],
        weeklySchedule: Array.isArray(rawPlan.weeklySchedule) ? rawPlan.weeklySchedule : [],
        studyTechniques: Array.isArray(rawPlan.studyTechniques) ? rawPlan.studyTechniques : [],
        additionalResources: Array.isArray(rawPlan.additionalResources)
          ? rawPlan.additionalResources
          : [],
        practiceStrategy: rawPlan.practiceStrategy || {
          approach: 'Regular practice with increasing difficulty',
          frequency: 'Daily practice sessions',
          questionTypes: ['Multiple choice', 'Short answer', 'Problem solving'],
          selfAssessment: 'Regular self-assessment through practice tests',
        },
        examPreparation: rawPlan.examPreparation || {
          finalWeekPlan: 'Review all materials and take practice tests',
          dayBeforeExam: 'Light review and relaxation',
          examDayTips: "Get a good night's sleep and arrive early",
        },
      }

      // Ensure weeklySchedule has the correct number of weeks
      if (cleanedPlan.weeklySchedule.length < studyPeriodWeeks) {
        // Add missing weeks
        for (let i = cleanedPlan.weeklySchedule.length + 1; i <= studyPeriodWeeks; i++) {
          cleanedPlan.weeklySchedule.push({
            week: i,
            focus: `Week ${i} Focus`,
            topics: ['Review previous material'],
            activities: [
              {
                type: 'Review',
                description: 'Review material from previous weeks',
                duration: '2 hours',
                resources: 'Previous notes and materials',
              },
            ],
            milestones: ['Complete review of previous material'],
          })
        }
      } else if (cleanedPlan.weeklySchedule.length > studyPeriodWeeks) {
        // Trim extra weeks
        cleanedPlan.weeklySchedule = cleanedPlan.weeklySchedule.slice(0, studyPeriodWeeks)
      }

      return NextResponse.json(cleanedPlan)
    } catch (error) {
      console.error('Error generating study plan:', error)

      // Create a fallback study plan in case of error
      const fallbackPlan: StudyPlan = {
        executiveSummary: 'A basic study plan has been created due to an error in generation.',
        topicBreakdown: [
          {
            topic: 'Core Concepts',
            subtopics: ['Fundamentals', 'Key Principles'],
            importance: 'High',
            estimatedStudyHours: Math.floor(studyHoursPerWeek * 0.4),
          },
          {
            topic: 'Applications',
            subtopics: ['Practical Uses', 'Case Studies'],
            importance: 'Medium',
            estimatedStudyHours: Math.floor(studyHoursPerWeek * 0.3),
          },
          {
            topic: 'Advanced Topics',
            subtopics: ['Specialized Areas', 'Current Research'],
            importance: 'Low',
            estimatedStudyHours: Math.floor(studyHoursPerWeek * 0.3),
          },
        ],
        weeklySchedule: Array.from({ length: studyPeriodWeeks }, (_, i) => ({
          week: i + 1,
          focus: `Week ${i + 1} Focus`,
          topics: ['Core Concepts', 'Applications'],
          activities: [
            {
              type: 'Reading',
              description: 'Read textbook chapters',
              duration: `${Math.floor(studyHoursPerWeek * 0.4)} hours`,
              resources: 'Textbook and online resources',
            },
            {
              type: 'Practice',
              description: 'Complete practice problems',
              duration: `${Math.floor(studyHoursPerWeek * 0.3)} hours`,
              resources: 'Practice worksheets',
            },
            {
              type: 'Review',
              description: 'Review notes and concepts',
              duration: `${Math.floor(studyHoursPerWeek * 0.3)} hours`,
              resources: 'Notes and summaries',
            },
          ],
          milestones: ['Complete assigned readings', 'Solve practice problems'],
        })),
        studyTechniques: [
          {
            technique: 'Active Recall',
            description: 'Test yourself on material without looking at notes',
            bestFor: ['Memorization', 'Understanding concepts'],
            example: 'Create flashcards and quiz yourself regularly',
          },
          {
            technique: 'Spaced Repetition',
            description: 'Review material at increasing intervals',
            bestFor: ['Long-term retention', 'Efficient studying'],
            example: 'Review notes after 1 day, then 3 days, then 1 week',
          },
        ],
        additionalResources: [
          {
            type: 'Book',
            name: 'Core Textbook',
            description: 'Main course textbook',
            relevantTopics: ['All topics'],
          },
          {
            type: 'Website',
            name: 'Online Resources',
            description: 'Supplementary materials and practice',
            relevantTopics: ['All topics'],
          },
        ],
        practiceStrategy: {
          approach: 'Regular practice with increasing difficulty',
          frequency: 'Daily practice sessions',
          questionTypes: ['Multiple choice', 'Short answer', 'Problem solving'],
          selfAssessment: 'Regular self-assessment through practice tests',
        },
        examPreparation: {
          finalWeekPlan: 'Review all materials and take practice tests',
          dayBeforeExam: 'Light review and relaxation',
          examDayTips: "Get a good night's sleep and arrive early",
        },
      }

      // Return the fallback plan with an error message
      return NextResponse.json(fallbackPlan)
    }
  } catch (error) {
    console.error('Error in study plan generation:', error)
    return errorResponse('An unexpected error occurred', null, 500)
  }
}
