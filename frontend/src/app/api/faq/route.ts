// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOllama } from 'ollama-ai-provider'
import { generateObject } from 'ai'
import { NextResponse } from 'next/server'
import { hybridSearch } from '@/lib/chunk/hybrid-search'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'

import {
  processChunksMultiPass,
  canGenerateMore,
  SystemPromptGenerator,
  ContentProcessor,
  GenerationFunction,
  ProcessResult,
} from '@/lib/rag/multi-pass'
import { ContextChunk } from '@/lib/types/context-chunk'

type FaqItem = {
  question: string
  answer: string
}

// Type for the processed FAQ result
type FaqResult = {
  FAQs: FaqItem[]
  _needNextPass?: boolean
  _sentToFrontend?: boolean
}

export const dynamic = 'force-dynamic'

// Configuration constants
const TEMPERATURE = parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const TOKEN_RESPONSE_BUDGET = 2048
const TOKEN_CONTEXT_BUDGET = 1024

// Content generation type for FAQs, not secret
const CONTENT_TYPE_FAQ = 'faq'

/**
 * System prompt generator for FAQ generation
 * Creates a prompt that instructs the model to generate diverse FAQs
 */
const faqSystemPromptGenerator: SystemPromptGenerator = (isFirstPass, query, options) => {
  const faqCount = options.faqCount || 5
  const hasValidSources = options.hasValidSources || false
  const courseInfo = options.courseInfo as
    | { courseName?: string; courseDescription?: string }
    | undefined

  const contextInstruction = hasValidSources
    ? 'based on the context provided'
    : courseInfo?.courseName
      ? `for the course "${courseInfo.courseName}"${courseInfo.courseDescription ? ` (${courseInfo.courseDescription})` : ''}. Use general academic knowledge relevant to this course`
      : 'using general academic knowledge'

  return `
  Your job is to generate diverse and interesting FAQs with question answer pairs ${contextInstruction}.

  Format ALL FAQs as a JSON object with this structure:
  {
    "FAQs": [
      {
        "question": "Question text",
        "answer": "Detailed and descriptive answer to the question. MUST be a string (not an object or array) and should be well-structured for human readability."
      }
    ]
  }

  Important Instructions:
  1. You MUST generate EXACTLY ${faqCount} FAQs - no more, no less.
  2. Create DIVERSE questions - vary question formats (how, what, why, can, etc.) and topics.
  3. Phrase questions differently - don't follow a rigid pattern.
  4. Focus on different aspects of the content - find unique angles and insights.
  5. Ensure all quotes and special characters in the JSON are properly escaped.
  6. The JSON must be valid and parsable without errors.
  7. Answers should be detailed, descriptive, and provide clear explanations${hasValidSources ? ' based on the context' : ''}.
  ${!hasValidSources && courseInfo?.courseName ? `8. Focus on questions and answers that would be relevant for students in ${courseInfo.courseName}.` : ''}
  `
}

/**
 * Creates a content processor that enforces FAQ count and uniqueness
 * Tracks FAQs already sent to the frontend to avoid duplicates
 */
const createFaqContentProcessor = (faqCount: number): ContentProcessor<FaqResult, FaqResult> => {
  // Use closure to persist tracker between calls
  const sentToFrontendQuestions = new Set<string>()

  return (result, previousResults) => {
    // Extract FAQs from the current result
    const faqs = result.FAQs || []

    // Process previous FAQs
    let previousFaqs: FaqItem[] = []
    if (previousResults && previousResults.length > 0) {
      const prevResult = previousResults[previousResults.length - 1]
      if (prevResult && 'FAQs' in prevResult && Array.isArray(prevResult.FAQs)) {
        previousFaqs = prevResult.FAQs

        // Mark previously returned FAQs as sent to frontend
        if (prevResult._sentToFrontend === true) {
          previousFaqs.forEach((faq) => {
            const normalizedQuestion = faq.question.toLowerCase().trim().replace(/\s+/g, ' ')
            sentToFrontendQuestions.add(normalizedQuestion.substring(0, 40))
          })
        }
      }
    }

    // Normalize previous questions for comparison
    const normalizedPrevQuestions = previousFaqs.map((faq) =>
      faq.question.toLowerCase().trim().replace(/\s+/g, ' '),
    )

    // Filter out duplicates from current generation
    const uniqueNewFaqsList = faqs.filter((newFaq: { question: string }) => {
      const normalizedNewQuestion = newFaq.question.toLowerCase().trim().replace(/\s+/g, ' ')
      const questionKey = normalizedNewQuestion.substring(0, 40)

      // Check for similarity with previous questions
      const isDuplicateOfPrevious = normalizedPrevQuestions.some(
        (prevQ) =>
          prevQ.includes(normalizedNewQuestion.substring(0, 30)) ||
          normalizedNewQuestion.includes(prevQ.substring(0, 30)),
      )

      // Check if already sent to frontend
      const isAlreadySentToFrontend =
        sentToFrontendQuestions.has(questionKey) ||
        Array.from(sentToFrontendQuestions).some(
          (sent) => sent.includes(questionKey) || questionKey.includes(sent),
        )

      return !isDuplicateOfPrevious && !isAlreadySentToFrontend
    })

    // Get all unique FAQs not yet sent to frontend
    let allUniqueFaqs = [
      ...previousFaqs.filter((faq) => {
        const normalizedQuestion = faq.question.toLowerCase().trim().replace(/\s+/g, ' ')
        const questionKey = normalizedQuestion.substring(0, 40)
        return !sentToFrontendQuestions.has(questionKey)
      }),
      ...uniqueNewFaqsList,
    ]

    // Determine if we need another pass
    const notEnoughFaqs = allUniqueFaqs.length < faqCount
    const allDuplicatesGenerated = uniqueNewFaqsList.length === 0 && faqs.length > 0
    const needNextPass = notEnoughFaqs || allDuplicatesGenerated

    // Trim to exact count if we have too many
    if (allUniqueFaqs.length > faqCount) {
      allUniqueFaqs = allUniqueFaqs.slice(0, faqCount)
    }

    // Prepare final result
    const finalResult: FaqResult = {
      FAQs: allUniqueFaqs,
      _needNextPass: needNextPass,
      _sentToFrontend: true,
    }

    // Add to tracking Set
    allUniqueFaqs.forEach((faq) => {
      const normalizedQuestion = faq.question.toLowerCase().trim().replace(/\s+/g, ' ')
      sentToFrontendQuestions.add(normalizedQuestion.substring(0, 40))
    })

    // Print statistics as a simple summary line
    console.log(
      `FAQ Stats: Generated ${faqs.length}, New unique ${uniqueNewFaqsList.length}, Total unique ${allUniqueFaqs.length}/${faqCount}, Need another pass: ${needNextPass ? 'Yes' : 'No'}`,
    )

    return finalResult
  }
}

/**
 * Wrapper function to adapt generateObject to the GenerationFunction interface
 */
const createFaqGenerationFunction = (): GenerationFunction<FaqResult> => {
  return async (options: Record<string, unknown>) => {
    const { model, messages, temperature, maxTokens } = options as {
      model: unknown
      messages: unknown
      temperature: number
      maxTokens: number
    }

    const result = await generateObject({
      model: model as Parameters<typeof generateObject>[0]['model'],
      output: 'no-schema' as const,
      messages: messages as Parameters<typeof generateObject>[0]['messages'],
      temperature,
      maxTokens,
    })

    // Transform the raw AI response to FaqResult format
    const rawResponse = result.object as Record<string, unknown>
    let faqs: FaqItem[] = []

    // Extract FAQs from the response
    if (rawResponse.FAQs && Array.isArray(rawResponse.FAQs)) {
      faqs = rawResponse.FAQs
    } else if (Array.isArray(rawResponse)) {
      faqs = rawResponse
    }

    const faqResult: FaqResult = {
      FAQs: faqs,
      _needNextPass: false,
      _sentToFrontend: false,
    }

    return {
      object: faqResult,
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
    }
  }
}

/**
 * POST handler for FAQ generation
 * Supports initial generation and continuation with automatic recursion
 */
export async function POST(req: Request) {
  try {
    // Parse request data
    const {
      selectedModel,
      selectedSources,
      faqCount,
      searchQuery,
      multiPassState,
      continueFaqs = false,
      useReranker, // Add this line with default value true
      _recursionDepth = 0,
      courseInfo, // Add courseInfo parameter
    } = await req.json()

    // Debug logging
    console.log('DEBUG FAQ API: courseInfo received:', courseInfo)
    console.log('DEBUG FAQ API: selectedSources length:', selectedSources?.length || 0)

    // Safety check to prevent infinite loops
    if (_recursionDepth > 10) {
      return NextResponse.json({
        faqs: multiPassState?.lastGenerated || { FAQs: [] },
        canContinue: false,
        multiPassState,
        progress: 100,
        debug: { message: 'Maximum recursion depth reached' },
      })
    }

    // Set up Ollama instance
    const ollamaUrl = process.env.OLLAMA_URL
    if (!ollamaUrl) {
      throw new Error('OLLAMA_URL is not defined in environment variables.')
    }
    const ollama = createOllama({ baseURL: ollamaUrl + '/api' })

    // Check if we have valid sources
    const hasValidSources = Array.isArray(selectedSources) && selectedSources.length > 0

    // Process user query
    const safeSearchQuery = typeof searchQuery === 'string' ? searchQuery : ''
    const hasUserQuery = safeSearchQuery.trim() !== ''
    const userQuery = hasUserQuery ? safeSearchQuery.trim() : ''
    let retrievedChunks: ContextChunk[] = []
    let usedHybridSearch = false

    // Only retrieve chunks on initial request and if we have valid sources
    if (!continueFaqs && hasValidSources) {
      if (hasUserQuery) {
        retrievedChunks = await hybridSearch(
          userQuery,
          selectedSources,
          0.7, // semantic weight
          0.3, // keyword weight
          30, // chunk count
          useReranker, // Use the value from the frontend toggle instead of hardcoded true
          30, // max chunks
        )
        usedHybridSearch = true
      } else {
        retrievedChunks = await getStoredChunks(selectedSources)
      }
    }

    // Additional debug logging
    console.log('DEBUG FAQ API: hasValidSources:', hasValidSources)
    console.log('DEBUG FAQ API: retrievedChunks length:', retrievedChunks.length)

    // Set up processing options
    const actualFaqCount = faqCount || 5
    const faqContentProcessor = createFaqContentProcessor(actualFaqCount)

    const options = {
      tokenBudget: TOKEN_CONTEXT_BUDGET,
      responseBudget: TOKEN_RESPONSE_BUDGET,
      batchSize: 3,
      temperature: TEMPERATURE + 0.1,
      faqCount: actualFaqCount,
      preserveOrder: !hasUserQuery,
      hasValidSources, // Add this for system prompt
      courseInfo, // Add this for system prompt
    }

    // Start processing timer
    const startTime = Date.now()

    // Create the FAQ generation function
    const faqGenerationFunction = createFaqGenerationFunction()

    let processResult: ProcessResult<FaqResult>

    // Handle no-sources case differently
    if (!hasValidSources && !continueFaqs) {
      // Direct generation without chunks for course context
      console.log('DEBUG FAQ API: Generating FAQs using course context only')
      const systemPrompt = faqSystemPromptGenerator(true, userQuery, options)
      const userPrompt = courseInfo?.courseName
        ? `Generate FAQs for the course "${courseInfo.courseName}"${userQuery ? ` related to: "${userQuery}"` : ''}. Use general academic knowledge relevant to this course.`
        : `Generate FAQs${userQuery ? ` for the topic: "${userQuery}"` : ''}. Use general academic knowledge to provide comprehensive answers.`

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt },
      ]

      try {
        const { object: rawResult, usage } = await faqGenerationFunction({
          model: ollama(selectedModel, { numCtx: TOKEN_RESPONSE_BUDGET }),
          output: 'no-schema',
          messages: messages,
          temperature: TEMPERATURE + 0.1,
          maxTokens: TOKEN_RESPONSE_BUDGET,
        })

        const processedResult = faqContentProcessor(rawResult, [])

        processResult = {
          result: processedResult,
          state: {
            chunks: [],
            processedChunkIds: [],
            currentIndex: 0,
            isComplete: true,
            generatedContent: [processedResult],
            progress: 100,
            lastGenerated: processedResult,
            contentType: CONTENT_TYPE_FAQ,
          },
          debug: {
            chunksProcessed: 0,
            totalChunks: 0,
            remainingChunks: 0,
            tokenUsage: {
              prompt: usage?.promptTokens || 0,
              completion: usage?.completionTokens || 0,
              total: usage?.totalTokens || 0,
            },
            timeTaken: Date.now() - startTime,
          },
        }
      } catch (error) {
        console.error('DEBUG FAQ API: Error in direct generation:', error)
        throw error
      }
    } else {
      // Use multi-pass approach for sources
      processResult = await processChunksMultiPass<FaqResult>(
        userQuery,
        continueFaqs ? [] : retrievedChunks,
        faqGenerationFunction,
        ollama(selectedModel, { numCtx: TOKEN_RESPONSE_BUDGET }),
        options,
        CONTENT_TYPE_FAQ,
        faqSystemPromptGenerator,
        (query) => {
          if (hasValidSources) {
            return `Generate FAQs for the following query: "${query}". Use the provided context to answer.`
          } else if (courseInfo?.courseName) {
            return `Generate FAQs for the course "${courseInfo.courseName}"${query ? ` related to: "${query}"` : ''}. Use general academic knowledge relevant to this course.`
          } else {
            return `Generate FAQs${query ? ` for the topic: "${query}"` : ''}. Use general academic knowledge to provide comprehensive answers.`
          }
        },
        faqContentProcessor,
        multiPassState,
      )
    }

    // Calculate processing time
    const timeTakenSeconds = (Date.now() - startTime) / 1000

    // Check if we need to continue processing
    const finalResult = processResult.result
    const needNextPass = finalResult._needNextPass === true
    const hasRemainingChunks = processResult.debug.remainingChunks > 0

    // Automatically continue processing if needed
    if (needNextPass && hasRemainingChunks) {
      console.log(`Continuing to next pass to get more FAQs to reach target count`)

      const nextRequest = {
        selectedModel,
        selectedSources,
        faqCount,
        searchQuery,
        multiPassState: processResult.state,
        continueFaqs: true,
        useReranker, // Include in recursive calls
        _recursionDepth: _recursionDepth + 1,
      }

      const nextReqObj = new Request(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(nextRequest),
      })

      return POST(nextReqObj)
    }

    // Return final result
    return NextResponse.json({
      faqs: finalResult,
      canContinue: canGenerateMore(processResult.state) && hasRemainingChunks,
      multiPassState: processResult.state,
      progress: processResult.state.progress,
      debug: {
        chunksProcessed: processResult.debug.chunksProcessed,
        totalChunks: processResult.debug.totalChunks,
        remainingChunks: processResult.debug.remainingChunks,
        usedQuery: userQuery || null,
        hybridSearchUsed: usedHybridSearch,
        timeTaken: timeTakenSeconds,
      },
    })
  } catch (error) {
    console.error('Error in FAQ generation:', error)
    return NextResponse.json(
      { error: 'An error occurred while processing the request.' },
      { status: 500 },
    )
  }
}
