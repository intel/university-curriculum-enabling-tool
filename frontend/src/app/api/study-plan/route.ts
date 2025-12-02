// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { getProvider } from '@/lib/providers'
import { type ModelMessage, generateObject } from 'ai'
import { NextResponse } from 'next/server'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'
import { errorResponse } from '@/lib/api-response'
import type { ClientSource } from '@/lib/types/client-source'
import type { StudyPlan } from '@/lib/types/study-plan'
import type { ContextChunk } from '@/lib/types/context-chunk'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
// export const maxDuration = 600 // 10 minutes (600 seconds) for Vercel deployment

// Configuration constants
const TEMPERATURE = Number.parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const TOKEN_MAX = Number.parseInt(process.env.RAG_TOKEN_MAX ?? '2048')
const TOKEN_RESPONSE_RATIO = Number.parseFloat(process.env.RESPONSE_TOKEN_PERCENTAGE || '0.7')
const TOKEN_RESPONSE_BUDGET = Math.floor(TOKEN_MAX * TOKEN_RESPONSE_RATIO)
const TOKEN_CONTEXT_BUDGET = Math.floor(TOKEN_MAX * (1 - TOKEN_RESPONSE_RATIO))
const provider = getProvider()

// Zod schemas for chunked study plan generation
// Chunk 1: Core structure - overview, topics, and strategies
const studyPlanCoreSchema = z.object({
  executiveSummary: z.string().min(1),
  topicBreakdown: z
    .array(
      z.object({
        topic: z.string(),
        subtopics: z.array(z.string()),
        importance: z.string(),
        estimatedStudyHours: z.number(),
      }),
    )
    .min(1),
  practiceStrategy: z.object({
    approach: z.string(),
    frequency: z.string(),
    questionTypes: z.array(z.string()),
    selfAssessment: z.string(),
  }),
  examPreparation: z.object({
    finalWeekPlan: z.string(),
    dayBeforeExam: z.string(),
    examDayTips: z.string(),
  }),
})

// Chunk 2: Weekly schedule only
const studyPlanWeeklySchema = z.object({
  weeklySchedule: z
    .array(
      z.object({
        week: z.number(),
        focus: z.string(),
        topics: z.array(z.string()),
        activities: z.array(
          z.object({
            type: z.string(),
            description: z.string(),
            duration: z.string(),
            resources: z.union([z.string(), z.array(z.string())]),
          }),
        ),
        milestones: z.array(z.string()),
      }),
    )
    .min(1),
})

// Chunk 3: Supporting materials - techniques and resources
const studyPlanSupportSchema = z.object({
  studyTechniques: z
    .array(
      z.object({
        technique: z.string(),
        description: z.string(),
        bestFor: z.array(z.string()),
        example: z.string(),
      }),
    )
    .min(1),
  additionalResources: z
    .array(
      z.object({
        type: z.string(),
        name: z.string(),
        description: z.string(),
        relevantTopics: z.array(z.string()),
      }),
    )
    .min(1),
})

// Helper function to count tokens (simple approximation)
function countTokens(text: string): number {
  return text.split(/\s+/).length
}

// Helper function to truncate text to fit within token limit
function truncateToTokenLimit(text: string, maxTokens: number): string {
  if (countTokens(text) <= maxTokens) {
    return text
  }

  // Better truncation: preserve original substring boundaries so we don't break
  // escapes or split mid-escape/quote sequences. Use a regex to find non-whitespace
  // tokens and track the last character index included from the original text.
  const tokenRegExp = /\S+/g
  let currentTokens = 0
  let lastIncludedIndex = 0

  while (tokenRegExp.exec(text) !== null) {
    // Each matched non-whitespace chunk counts as 1 token in our approximation
    if (currentTokens + 1 > maxTokens) {
      break
    }
    currentTokens += 1
    // regExp.lastIndex points to the position after the match
    lastIncludedIndex = tokenRegExp.lastIndex
  }

  // If no tokens fit, return only an ellipsis
  if (lastIncludedIndex === 0) return '...'

  // Use the original substring so escapes and spacing are preserved
  const truncated = text.slice(0, lastIncludedIndex).trim()

  // Ensure balanced brackets/parentheses/quotes to avoid leaving unterminated structures
  const openStack: string[] = []
  let inDouble = false
  let inSingle = false
  let escaped = false

  for (let i = 0; i < truncated.length; i++) {
    const ch = truncated[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\') {
      escaped = true
      continue
    }

    if (!inSingle && ch === '"') {
      inDouble = !inDouble
      continue
    }

    if (!inDouble && ch === "'") {
      inSingle = !inSingle
      continue
    }

    // Only consider bracket balancing when not inside a string
    if (!inDouble && !inSingle) {
      if (ch === '{' || ch === '[' || ch === '(') {
        openStack.push(ch)
      } else if (ch === '}' || ch === ']' || ch === ')') {
        const last = openStack[openStack.length - 1]
        if (
          (ch === '}' && last === '{') ||
          (ch === ']' && last === '[') ||
          (ch === ')' && last === '(')
        ) {
          openStack.pop()
        } else {
          // mismatched closing - ignore
        }
      }
    }
  }

  // Build required closing characters (reverse order)
  let closers = ''
  if (inDouble) closers += '"'
  if (inSingle) closers += "'"

  while (openStack.length > 0) {
    const last = openStack.pop()
    if (last === '{') closers += '}'
    else if (last === '[') closers += ']'
    else if (last === '(') closers += ')'
  }

  return truncated + '...' + closers
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
    const assistantMessage: ModelMessage = {
      role: 'assistant',
      content: assistantContent,
    }

    console.log('Generating study plan in chunks to avoid token limits...')
    const startTime = Date.now()
    try {
      // CHUNK 1: Generate core structure (executive summary, topics, strategies)
      console.log('Chunk 1/3: Generating core structure...')
      const corePrompt = `You are a professional educational consultant. Generate the CORE STRUCTURE of a study plan.

LEARNING STYLE: ${learningStyle.toUpperCase()}
${learningStylePrompt}

DIFFICULTY LEVEL: ${difficultyLevel.toUpperCase()}
${difficultyLevelPrompt}

STUDY PARAMETERS:
- Study period: ${studyPeriodWeeks} weeks
- Available study time: ${studyHoursPerWeek} hours per week

Return ONLY a JSON object with these fields:
{
  "executiveSummary": "Brief overview mentioning learning style, difficulty level, and key focus areas",
  "topicBreakdown": [
    {
      "topic": "Topic name",
      "subtopics": ["Subtopic 1", "Subtopic 2"],
      "importance": "High/Medium/Low",
      "estimatedStudyHours": 10
    }
  ],
  "practiceStrategy": {
    "approach": "Overall practice approach",
    "frequency": "Recommended practice frequency",
    "questionTypes": ["Multiple choice", "Short answer", "Problem solving"],
    "selfAssessment": "Methods to assess progress"
  },
  "examPreparation": {
    "finalWeekPlan": "Detailed plan for the final week",
    "dayBeforeExam": "Recommendations for day before exam",
    "examDayTips": "Tips for exam day"
  }
}

IMPORTANT RULES:
1. Your response MUST be ONLY the JSON object with no additional text, markdown, or explanations
2. All fields in the JSON structure are REQUIRED - do not omit any fields
3. All arrays must be properly formatted with square brackets and comma-separated values
4. All strings must be properly quoted
5. Ensure activities align with the ${learningStyle} learning style
6. Match content difficulty to ${difficultyLevel} level
7. Make all explanations clear and actionable
8. Provide concrete, specific information based on the source materials
9. Do not add any fields that are not in the template above
10. Do not include any comments or explanations outside the JSON structure`

      const { object: coreData } = await generateObject({
        model: provider(selectedModel),
        schema: studyPlanCoreSchema,
        messages: [
          { role: 'system', content: corePrompt },
          assistantMessage,
          {
            role: 'user',
            content: `Generate the core structure for a ${difficultyLevel} level ${courseName} study plan.`,
          },
        ],
        temperature: TEMPERATURE,
        maxOutputTokens: TOKEN_RESPONSE_BUDGET,
        providerOptions: {
          openaiCompatible: {
            numCtx: TOKEN_MAX,
          },
        },
      })

      console.log('Chunk 1 complete:', coreData)

      // CHUNK 2: Generate weekly schedule
      console.log('Chunk 2/3: Generating weekly schedule...')
      const weeklyPrompt = `You are a professional educational consultant. Generate a WEEKLY SCHEDULE for a study plan.

CONTEXT FROM CORE PLAN:
${coreData.executiveSummary}

TOPICS TO COVER:
${coreData.topicBreakdown.map((t) => `- ${t.topic}: ${t.subtopics.join(', ')} (${t.estimatedStudyHours}h)`).join('\n')}

LEARNING STYLE: ${learningStyle.toUpperCase()}
${learningStylePrompt}

REQUIREMENTS:
- Generate exactly ${studyPeriodWeeks} weeks
- Distribute ${studyHoursPerWeek} hours per week across activities
- Align activities with ${learningStyle} learning style
- Match difficulty to ${difficultyLevel} level

Return ONLY a JSON object:
{
  "weeklySchedule": [
    {
      "week": 1,
      "focus": "Week's main focus",
      "topics": ["Topic 1", "Topic 2"],
      "activities": [
        {
          "type": "Reading/Practice/Review/Quiz",
          "description": "Detailed activity description",
          "duration": "2 hours",
          "resources": "Specific resources"
        }
      ],
      "milestones": ["Achievement 1", "Achievement 2"]
    }
  ]
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
9. Ensure milestones are measurable and achievable
10. Do not add any fields that are not in the template above
11. Do not include any comments or explanations outside the JSON structure`

      const { object: weeklyData } = await generateObject({
        model: provider(selectedModel),
        schema: studyPlanWeeklySchema,
        messages: [
          { role: 'system', content: weeklyPrompt },
          assistantMessage,
          {
            role: 'user',
            content: `Generate ${studyPeriodWeeks} weeks of detailed schedule with ${studyHoursPerWeek} hours per week.`,
          },
        ],
        temperature: TEMPERATURE,
        maxOutputTokens: TOKEN_RESPONSE_BUDGET,
        providerOptions: {
          openaiCompatible: {
            numCtx: TOKEN_MAX,
          },
        },
      })

      console.log('Chunk 2 complete:', weeklyData.weeklySchedule.length, 'weeks generated')

      // CHUNK 3: Generate supporting materials
      console.log('Chunk 3/3: Generating study techniques and resources...')
      const supportPrompt = `You are a professional educational consultant. Generate STUDY TECHNIQUES and ADDITIONAL RESOURCES.

CONTEXT:
${coreData.executiveSummary}

TOPICS:
${coreData.topicBreakdown.map((t) => t.topic).join(', ')}

LEARNING STYLE: ${learningStyle.toUpperCase()}
${learningStylePrompt}

Return ONLY a JSON object:
{
  "studyTechniques": [
    {
      "technique": "Technique name",
      "description": "Detailed description",
      "bestFor": ["Use case 1", "Use case 2"],
      "example": "Concrete example of application"
    }
  ],
  "additionalResources": [
    {
      "type": "Book/Video/Website/Tool",
      "name": "Resource name",
      "description": "How it helps",
      "relevantTopics": ["Topic 1", "Topic 2"]
    }
  ]
}

IMPORTANT RULES:
1. Your response MUST be ONLY the JSON object with no additional text, markdown, or explanations
2. All fields in the JSON structure are REQUIRED - do not omit any fields
3. All arrays must be properly formatted with square brackets and comma-separated values
4. All strings must be properly quoted
5. Provide concrete examples for all study techniques
6. Ensure techniques align with the ${learningStyle} learning style
7. Make all explanations clear and actionable
8. Do not add any fields that are not in the template above
9. Do not include any comments or explanations outside the JSON structure`

      const { object: supportData } = await generateObject({
        model: provider(selectedModel),
        schema: studyPlanSupportSchema,
        messages: [
          { role: 'system', content: supportPrompt },
          assistantMessage,
          {
            role: 'user',
            content: `Generate study techniques and resources for ${learningStyle} learners studying ${courseName}.`,
          },
        ],
        temperature: TEMPERATURE,
        maxOutputTokens: TOKEN_RESPONSE_BUDGET,
        providerOptions: {
          openaiCompatible: {
            numCtx: TOKEN_MAX,
          },
        },
      })

      console.log('Chunk 3 complete')

      // Normalize weekly schedule: ensure activity.resources is always a string
      type WeeklyActivity = {
        type: string
        description: string
        duration: string
        resources: string | string[] | undefined
      }

      type WeeklyWeek = {
        week: number
        focus: string
        topics: string[]
        activities: WeeklyActivity[]
        milestones: string[]
      }

      const normalizedWeekly = (weeklyData.weeklySchedule as WeeklyWeek[]).map((week) => ({
        ...week,
        activities: (week.activities as WeeklyActivity[]).map((act) => ({
          ...act,
          resources: Array.isArray(act.resources) ? act.resources.join(', ') : act.resources || '',
        })),
      }))

      // Combine all chunks into final study plan
      const studyPlan: StudyPlan = {
        executiveSummary: coreData.executiveSummary,
        topicBreakdown: coreData.topicBreakdown,
        weeklySchedule: normalizedWeekly,
        studyTechniques: supportData.studyTechniques,
        additionalResources: supportData.additionalResources,
        practiceStrategy: coreData.practiceStrategy,
        examPreparation: coreData.examPreparation,
      }

      // End timing and calculate the time taken
      const endTime = Date.now()
      const timeTakenSeconds = (endTime - startTime) / 1000

      console.log(`Generation completed in ${timeTakenSeconds.toFixed(2)} seconds`)

      // studyPlan is now properly typed and validated by Zod schema
      // const cleanedPlan: StudyPlan = {
      //   ...studyPlan,
      //   executiveSummary:
      //     rawPlan.executiveSummary || 'A personalized study plan tailored to your learning needs.',
      //   topicBreakdown: Array.isArray(rawPlan.topicBreakdown) ? rawPlan.topicBreakdown : [],
      //   weeklySchedule: Array.isArray(rawPlan.weeklySchedule) ? rawPlan.weeklySchedule : [],
      //   studyTechniques: Array.isArray(rawPlan.studyTechniques) ? rawPlan.studyTechniques : [],
      //   additionalResources: Array.isArray(rawPlan.additionalResources)
      //     ? rawPlan.additionalResources
      //     : [],
      //   practiceStrategy: rawPlan.practiceStrategy || {
      //     approach: 'Regular practice with increasing difficulty',
      //     frequency: 'Daily practice sessions',
      //     questionTypes: ['Multiple choice', 'Short answer', 'Problem solving'],
      //     selfAssessment: 'Regular self-assessment through practice tests',
      //   },
      //   examPreparation: rawPlan.examPreparation || {
      //     finalWeekPlan: 'Review all materials and take practice tests',
      //     dayBeforeExam: 'Light review and relaxation',
      //     examDayTips: "Get a good night's sleep and arrive early",
      //   },
      // }

      // Ensure weeklySchedule has the correct number of weeks
      if (studyPlan.weeklySchedule.length < studyPeriodWeeks) {
        // Add missing weeks
        for (let i = studyPlan.weeklySchedule.length + 1; i <= studyPeriodWeeks; i++) {
          studyPlan.weeklySchedule.push({
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
      } else if (studyPlan.weeklySchedule.length > studyPeriodWeeks) {
        // Trim extra weeks
        studyPlan.weeklySchedule = studyPlan.weeklySchedule.slice(0, studyPeriodWeeks)
      }

      console.log('Checking on the sanitized studyPlan')
      console.log(studyPlan)

      return NextResponse.json(studyPlan)
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

      console.log('Fallback content is being utilized')
      console.log(fallbackPlan)

      // Return the fallback plan with an error message
      return NextResponse.json(fallbackPlan)
    }
  } catch (error) {
    console.error('Error in study plan generation:', error)
    return errorResponse('An unexpected error occurred', null, 500)
  }
}
