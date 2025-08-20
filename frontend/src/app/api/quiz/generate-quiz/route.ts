// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOllama } from 'ollama-ai-provider'
import { type CoreMessage, generateObject } from 'ai'
import { NextResponse } from 'next/server'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'
import { effectiveTokenCountForText } from '@/lib/utils'
import { errorResponse } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// Configuration constants
const TEMPERATURE = Number.parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const TOKEN_MAX = Number.parseInt(process.env.RAG_TOKEN_MAX ?? '2048')
const TOKEN_RESPONSE_BUDGET = 2048
const TOKEN_CONTEXT_BUDGET = 1024

export async function POST(req: Request) {
  try {
    const { selectedModel, selectedSources, difficulty, numQuestions, questionType } =
      await req.json()

    console.log('Data from request:', {
      selectedModel,
      selectedSources,
      difficulty,
      numQuestions,
      questionType,
    })

    const ollamaUrl = process.env.OLLAMA_URL
    if (!ollamaUrl) {
      throw new Error('OLLAMA_URL is not defined in environment variables.')
    }
    const ollama = createOllama({ baseURL: ollamaUrl + '/api' })

    const getQuestionTypePrompt = (type: string, difficulty: string) => {
      const basePrompts = {
        mcq: `Create multiple choice questions with:
        - Clear question text
        - Exactly 4 options per question
        - One correct answer
        - Other options should be plausible but clearly incorrect
        - ${
          difficulty === 'easy'
            ? 'Simple, distinct options'
            : difficulty === 'medium'
              ? 'Moderately challenging distractors'
              : 'Sophisticated distractors that require careful analysis'
        }
        - Detailed explanation of why the correct answer is right`,

        fillInTheBlank: `Create fill-in-the-blank questions with:
        - Complete sentences or paragraphs
        - Exactly one [BLANK] per question where key terms should be filled
        - ${
          difficulty === 'easy'
            ? 'Basic vocabulary and simple concepts'
            : difficulty === 'medium'
              ? 'More complex terminology and relationships'
              : 'Advanced concepts and technical terminology'
        }
        - The blank should test important concepts
        - Provide the exact word or phrase that should fill the blank
        - Include context clues in the sentence
        `,

        shortAnswer: `Create short answer questions with:
        - Open-ended questions that require understanding
        - Clear, focused questions that can be answered in ${
          difficulty === 'easy'
            ? '1-2 simple sentences'
            : difficulty === 'medium'
              ? '2-3 detailed sentences'
              : '3-4 comprehensive sentences'
        }
        - Model answers that include key points
        - List of acceptable variations or key concepts
        - ${
          difficulty === 'easy'
            ? 'Basic concepts and straightforward answers'
            : difficulty === 'medium'
              ? 'Multiple concepts and relationships'
              : 'Complex analysis and comprehensive explanations'
        }
        - Scoring criteria in the explanation`,

        trueFalse: `Create true/false questions with:
        - Clear, unambiguous statements that are either true or false
        - ${
          difficulty === 'easy'
            ? 'Basic facts and simple concepts'
            : difficulty === 'medium'
              ? 'Relationships between multiple concepts'
              : 'Complex relationships and nuanced understanding'
        }
        - No double negatives or tricky wording
        - Detailed explanation of why the statement is true or false
        - Focus on important concepts from the context
        - Include both true and false statements in a balanced way`,
      }

      return basePrompts[type as keyof typeof basePrompts] || ''
    }

    const getDifficultyPrompt = (difficulty: string) => {
      switch (difficulty) {
        case 'easy':
          return `Create beginner-friendly questions that:
      - Use simple, clear language
      - Focus on basic concepts and definitions
      - Provide straightforward answers
      - Include helpful context clues
      - Avoid complex terminology`
        case 'medium':
          return `Create intermediate-level questions that:
      - Combine multiple concepts
      - Require analytical thinking
      - Test understanding of relationships between concepts
      - Include some technical terminology
      - Challenge learners to apply their knowledge`
        case 'hard':
          return `Create advanced-level questions that:
      - Test deep understanding of complex concepts
      - Require critical thinking and analysis
      - Include advanced terminology and concepts
      - Challenge learners to synthesize information
      - Test edge cases and nuanced understanding`
        default:
          return ''
      }
    }

    const quizSystemPrompt = `You are a quiz generator. Create a ${difficulty} difficulty quiz with EXACTLY ${numQuestions} questions of type "${questionType}" based on the provided context.

${getDifficultyPrompt(difficulty)}

${getQuestionTypePrompt(questionType, difficulty)}

Format ALL questions as a JSON object with this structure:
{
  "questions": [
    ${
      questionType === 'trueFalse'
        ? `{
              "statement": "Statement to evaluate as true or false",
              "correctAnswer": "true",
              "explanation": "Detailed explanation of why the statement is true or false. MUST be a string (not an object or array) and should be well-structured for human readability. In 1 or 2 sentences.",
              "type": "trueFalse",
              "difficulty": "${difficulty}"
            }`
        : `{
              "question": "Question text ${questionType === 'fillInTheBlank' ? 'with [BLANK]' : ''}",
              ${questionType === 'mcq' ? '"options": ["Option 1", "Option 2", "Option 3", "Option 4"],' : ''}
              "correctAnswer": "Correct answer or word for blank",
              "explanation": "Detailed explanation with scoring criteria. MUST be a string (not an object or array) and should be well-structured for human readability.",
              "type": "${questionType}",
              "difficulty": "${difficulty}"
            }`
    }
  ]
}

IMPORTANT: 
- ALL questions MUST be of type "${questionType}"
- ALL questions MUST maintain the specified ${difficulty} difficulty level
- Explanations should be appropriate for the difficulty level`

    const systemMessage: CoreMessage = {
      role: 'system',
      content: quizSystemPrompt,
    }

    const userMessage: CoreMessage = {
      role: 'user',
      content: `Generate ${numQuestions} ${questionType} questions based on the provided context.`,
    }

    let usedTokens =
      effectiveTokenCountForText(quizSystemPrompt) +
      effectiveTokenCountForText(userMessage.content.toString())
    let chunkContent = ''
    let chunksAdded = 0
    let assistantContent = ''

    try {
      const retrievedChunks = await getStoredChunks(selectedSources)
      console.log('Retrieved chunks:', retrievedChunks.length)

      for (const chunk of retrievedChunks) {
        const chunkTokens = effectiveTokenCountForText(chunk.chunk)
        if (usedTokens + chunkTokens <= TOKEN_CONTEXT_BUDGET) {
          chunkContent += `\n\n${chunk.chunk}`
          usedTokens += chunkTokens
          chunksAdded++
        } else {
          break
        }
      }

      assistantContent = chunkContent || 'No relevant knowledge found.'
      console.log(
        `Total Chunks: ${chunksAdded}/${retrievedChunks.length} | ` +
          `Prompt tokens: ` +
          `system(${effectiveTokenCountForText(systemMessage.content.toString())}) ` +
          `user(${effectiveTokenCountForText(userMessage.content.toString())}) ` +
          `assistant(${effectiveTokenCountForText(assistantContent)}) | ` +
          `Budget tokens: ` +
          `context(${TOKEN_CONTEXT_BUDGET}) ` +
          `response(${TOKEN_RESPONSE_BUDGET}) ` +
          `max(${TOKEN_MAX})`,
      )
    } catch (error) {
      console.error('Error retrieving knowledge:', error)
      assistantContent = 'An error occurred while retrieving knowledge.'
    }

    const assistantMessage: CoreMessage = {
      role: 'assistant',
      content: assistantContent,
    }

    const fullMessages = [systemMessage, assistantMessage, userMessage]

    console.log('Generating quiz with Ollama...')
    const startTime = Date.now()
    const { object: quiz, usage } = await generateObject({
      model: ollama(selectedModel, { numCtx: TOKEN_RESPONSE_BUDGET }),
      output: 'no-schema',
      messages: fullMessages,
      temperature: TEMPERATURE,
      maxTokens: TOKEN_RESPONSE_BUDGET,
    })

    // End timing and calculate the time taken.
    const endTime = Date.now()
    const timeTakenMs = endTime - startTime
    const timeTakenSeconds = timeTakenMs / 1000

    // Calculate token generation speed.
    const totalTokens = usage.completionTokens
    const tokenGenerationSpeed = totalTokens / timeTakenSeconds

    console.log(
      `Usage tokens: ` +
        `promptEst(${usedTokens}) ` +
        `prompt(${usage.promptTokens}) ` +
        `completion(${usage.completionTokens}) | ` +
        `${tokenGenerationSpeed.toFixed(2)} t/s | ` +
        `Duration: ${timeTakenSeconds.toFixed(2)} s`,
    )
    console.log('Generated Quiz:', JSON.stringify(quiz, null, 2))
    // // Validate question types
    // interface QuizQuestion {
    //     type: string
    //     difficulty: string
    //     question: string
    //     options?: string[]
    //     correctAnswer?: string
    //     correctAnswers?: string[]
    //     explanation: string
    //     statement?: string
    //   }

    //   interface Quiz {
    //     questions: QuizQuestion[]
    //   }

    //   const quizResult = quiz as Quiz

    //   if (!quizResult || !quizResult.questions || !Array.isArray(quizResult.questions)) {
    //     throw new Error("Invalid quiz format")
    //   }

    //   if (quizResult.questions.length !== numQuestions) {
    //     throw new Error(`Invalid number of questions. Expected ${numQuestions}, got ${quizResult.questions.length}`)
    //   }

    //   // Ensure all questions are of the selected type
    //   const invalidQuestions = quizResult.questions.filter((q) => q.type !== questionType)
    //   if (invalidQuestions.length > 0) {
    //     throw new Error(`Some questions have incorrect type. All questions must be of type "${questionType}"`)
    //   }

    //   // Validate difficulty level
    //   if (!quizResult.questions.every((q) => q.difficulty === difficulty)) {
    //     throw new Error(
    //       `Some questions have incorrect difficulty level. All questions must be "${difficulty}" difficulty`,
    //     )
    //   }

    return NextResponse.json(quiz)
  } catch (error) {
    console.error('Error in summary generation:', error)
    return errorResponse('An unexpected error occurred', null, 500)
  }
}
