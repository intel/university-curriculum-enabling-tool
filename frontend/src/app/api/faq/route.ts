// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { getProvider } from '@/lib/providers'
import { generateObject, convertToModelMessages, type UIMessage } from 'ai'
import { NextResponse } from 'next/server'
import { hybridSearch } from '@/lib/chunk/hybrid-search'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'
import { z } from 'zod'

import {
  processChunksMultiPass,
  canGenerateMore,
  SystemPromptGenerator,
  ContentProcessor,
  GenerationFunction,
  ProcessResult,
} from '@/lib/rag/multi-pass'
import { ContextChunk } from '@/lib/types/context-chunk'

// Zod schema for FAQ items
const faqItemSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
  answer: z.string().min(1, 'Answer cannot be empty'),
})

// Zod schema for FAQ response
const faqResponseSchema = z.object({
  FAQs: z.array(faqItemSchema).min(1, 'At least one FAQ is required'),
})

// Type inference from Zod schemas
type FaqItem = z.infer<typeof faqItemSchema>

// Type for the processed FAQ result
type FaqResult = {
  FAQs: FaqItem[]
  _needNextPass?: boolean
  _sentToFrontend?: boolean
}

type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number }
const getInputTokens = (u?: Usage | undefined) => u?.inputTokens ?? 0
const getOutputTokens = (u?: Usage | undefined) => u?.outputTokens ?? 0
const getTotalTokens = (u?: Usage | undefined) => u?.totalTokens ?? 0
const provider = getProvider()

export const dynamic = 'force-dynamic'

// Configuration constants
const TEMPERATURE = parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const TOKEN_RESPONSE_BUDGET = 2048
const TOKEN_CONTEXT_BUDGET = 1024

// Language directive for enforcing output language
const langDirective = (lang: 'en' | 'id') =>
  lang === 'id'
    ? 'PENTING: Semua output harus dalam Bahasa Indonesia yang jelas dan alami.'
    : 'IMPORTANT: All output must be in clear and natural English.'

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
  const language = (options.language as 'en' | 'id') || 'en'

  const contextInstructionEN = hasValidSources
    ? 'based on the provided context'
    : courseInfo?.courseName
      ? `for the course "${courseInfo.courseName}"${courseInfo.courseDescription ? ` (${courseInfo.courseDescription})` : ''}. Use general academic knowledge relevant to this course`
      : 'using general academic knowledge'

  const contextInstructionID = hasValidSources
    ? 'berdasarkan konteks yang disediakan'
    : courseInfo?.courseName
      ? `untuk mata kuliah "${courseInfo.courseName}"${courseInfo.courseDescription ? ` (${courseInfo.courseDescription})` : ''}. Gunakan pengetahuan akademik umum yang relevan dengan mata kuliah ini`
      : 'dengan menggunakan pengetahuan akademik umum'

  if (language === 'id') {
    return `
  ${langDirective(language)}

  Tugas Anda adalah menghasilkan FAQ yang beragam dan menarik berupa pasangan pertanyaan–jawaban ${contextInstructionID}.

  Format SEMUA FAQ sebagai objek JSON dengan struktur berikut (JANGAN terjemahkan kunci JSON – gunakan persis: FAQs, question, answer):
  {
    "FAQs": [
      {
        "question": "Teks pertanyaan",
        "answer": "Jawaban yang rinci dan deskriptif. HARUS berupa string (bukan objek atau array) dan terstruktur dengan baik agar mudah dibaca."
      }
    ]
  }
    
  Instruksi Penting:
  1. Anda HARUS menghasilkan TEPAT ${faqCount} FAQ — tidak kurang, tidak lebih.
  2. Buat pertanyaan yang BERAGAM — variasikan format (bagaimana, apa, mengapa, apakah, dll.) dan topik.
  3. Susun pertanyaan dengan cara yang berbeda — jangan mengikuti pola yang kaku.
  4. Fokus pada aspek konten yang berbeda — temukan sudut pandang dan wawasan yang unik.
  5. Pastikan semua tanda kutip dan karakter khusus dalam JSON ter-escape dengan benar.
  6. JSON harus valid dan dapat di-parse tanpa kesalahan.
  7. Jawaban harus rinci, deskriptif, dan memberikan penjelasan yang jelas${hasValidSources ? ' berdasarkan konteks' : ''}.
  ${!hasValidSources && courseInfo?.courseName ? `8. Fokus pada pertanyaan dan jawaban yang relevan bagi mahasiswa di ${courseInfo.courseName}.` : ''}
  `
  }

  // English default
  return `
  ${langDirective(language)}

  Your job is to generate diverse and interesting FAQs with question–answer pairs ${contextInstructionEN}.

  Format ALL FAQs as a JSON object with this structure (Do NOT translate JSON keys — use exactly: FAQs, question, answer):
  {
    "FAQs": [
      {
        "question": "Question text",
        "answer": "Detailed and descriptive answer to the question. MUST be a string (not an object or array) and should be well-structured for human readability."
      }
    ]
  }
    
  Important Instructions:
  1. You MUST generate EXACTLY ${faqCount} FAQs — no more, no less.
  2. Create DIVERSE questions — vary question formats (how, what, why, can, etc.) and topics.
  3. Phrase questions differently — don't follow a rigid pattern.
  4. Focus on different aspects of the content — find unique angles and insights.
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
    // Extract FAQs from the current result - with better error handling
    if (!result) {
      console.error('FAQ Content Processor: result is undefined or null')
      result = { FAQs: [] }
    }
    const faqs = Array.isArray(result.FAQs) ? result.FAQs : []

    // Process previous FAQs
    let previousFaqs: FaqItem[] = []
    if (previousResults && Array.isArray(previousResults) && previousResults.length > 0) {
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

    // Ensure previousFaqs is always an array
    if (!Array.isArray(previousFaqs)) {
      previousFaqs = []
    }

    // Normalize previous questions for comparison
    const normalizedPrevQuestions = previousFaqs.map((faq) =>
      faq.question.toLowerCase().trim().replace(/\s+/g, ' '),
    )

    // Filter out duplicates from current generation
    console.log(
      'DEBUG FAQ Processor: faqs type:',
      typeof faqs,
      'isArray:',
      Array.isArray(faqs),
      'length:',
      faqs?.length,
    )
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
    const { model, messages, temperature, maxOutputTokens } = options as {
      model: unknown
      messages: unknown
      temperature: number
      maxOutputTokens: number
    }

    if (!messages) {
      throw new Error('createFaqGenerationFunction: messages is required')
    }

    if (!Array.isArray(messages)) {
      throw new Error('createFaqGenerationFunction: messages must be an array')
    }

    // Handle both UIMessage format (with parts) and ModelMessage format (with content)
    let modelMessages: Parameters<typeof generateObject>[0]['messages']

    if (messages.length > 0 && 'parts' in messages[0]) {
      // UIMessage format from direct generation - convert using AI SDK utility
      modelMessages = convertToModelMessages(messages as UIMessage[])
    } else {
      // ModelMessage format from multi-pass system - use directly
      modelMessages = messages as Parameters<typeof generateObject>[0]['messages']
    }

    // Ensure modelMessages is never undefined
    if (!modelMessages || !Array.isArray(modelMessages)) {
      throw new Error('createFaqGenerationFunction: Failed to process messages into valid format')
    }

    const result = await generateObject({
      model: model as Parameters<typeof generateObject>[0]['model'],
      schema: faqResponseSchema,
      messages: modelMessages,
      temperature,
      maxOutputTokens,
      providerOptions: {
        openaiCompatible: {
          numCtx: TOKEN_RESPONSE_BUDGET,
        },
      },
    })

    // Transform the raw AI response to FaqResult format
    if (!result || !result.object) {
      console.error('FAQ Generation: generateObject returned null or undefined result')
      return {
        object: { FAQs: [], _needNextPass: false, _sentToFrontend: false },
        usage: undefined,
      }
    }

    const rawResponse = result.object as Record<string, unknown>
    let faqs: FaqItem[] = []

    // Extract FAQs from the response with better error handling
    console.log(
      'DEBUG FAQ Generation: rawResponse type:',
      typeof rawResponse,
      'rawResponse:',
      JSON.stringify(rawResponse, null, 2),
    )

    if (rawResponse && rawResponse.FAQs && Array.isArray(rawResponse.FAQs)) {
      faqs = rawResponse.FAQs
    } else if (Array.isArray(rawResponse)) {
      faqs = rawResponse
    } else {
      console.warn('FAQ Generation: Unexpected response format, using empty array')
      faqs = []
    }

    const faqResult: FaqResult = {
      FAQs: faqs,
      _needNextPass: false,
      _sentToFrontend: false,
    }

    const usageObj = result.usage
      ? ({
          inputTokens: (result.usage as Usage).inputTokens ?? undefined,
          outputTokens: (result.usage as Usage).outputTokens ?? undefined,
          totalTokens: (result.usage as Usage).totalTokens ?? undefined,
        } as Usage)
      : undefined

    return {
      object: faqResult,
      usage: usageObj,
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
      language = 'en',
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
      language,
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
      let userPrompt: string
      if (courseInfo?.courseName) {
        if (language === 'id') {
          userPrompt = `Buat FAQ untuk mata kuliah "${courseInfo.courseName}"${userQuery ? ` terkait: "${userQuery}"` : ''}. Gunakan pengetahuan akademik umum yang relevan dengan mata kuliah ini.`
        } else {
          userPrompt = `Generate FAQs for the course "${courseInfo.courseName}"${userQuery ? ` related to: "${userQuery}"` : ''}. Use general academic knowledge relevant to this course.`
        }
      } else {
        if (language === 'id') {
          userPrompt = `Buat FAQ${userQuery ? ` untuk topik: "${userQuery}"` : ''}. Gunakan pengetahuan akademik umum untuk memberikan jawaban yang komprehensif.`
        } else {
          userPrompt = `Generate FAQs${userQuery ? ` for the topic: "${userQuery}"` : ''}. Use general academic knowledge to provide comprehensive answers.`
        }
      }

      const messages = [
        { role: 'system' as const, parts: [{ type: 'text', text: systemPrompt }] },
        { role: 'user' as const, parts: [{ type: 'text', text: userPrompt }] },
      ]

      try {
        const { object: rawResult, usage } = await faqGenerationFunction({
          model: provider(selectedModel),
          output: 'no-schema',
          messages: messages,
          temperature: TEMPERATURE + 0.1,
          maxOutputTokens: TOKEN_RESPONSE_BUDGET,
          providerOptions: {
            ollama: {
              mode: 'json',
              options: {
                numCtx: TOKEN_RESPONSE_BUDGET,
              },
            },
          },
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
              prompt: getInputTokens(usage as Usage | undefined),
              completion: getOutputTokens(usage as Usage | undefined),
              total: getTotalTokens(usage as Usage | undefined),
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
        provider(selectedModel),
        options,
        CONTENT_TYPE_FAQ,
        faqSystemPromptGenerator,
        (query) => {
          if (hasValidSources) {
            return language === 'id'
              ? `Buat FAQ untuk kueri berikut: "${query}". Gunakan konteks yang disediakan untuk menjawab.`
              : `Generate FAQs for the following query: "${query}". Use the provided context to answer.`
          } else if (courseInfo?.courseName) {
            return language === 'id'
              ? `Buat FAQ untuk mata kuliah "${courseInfo.courseName}"${query ? ` terkait: "${query}"` : ''}. Gunakan pengetahuan akademik umum yang relevan dengan mata kuliah ini.`
              : `Generate FAQs for the course "${courseInfo.courseName}"${query ? ` related to: "${query}"` : ''}. Use general academic knowledge relevant to this course.`
          } else {
            return language === 'id'
              ? `Buat FAQ${query ? ` untuk topik: "${query}"` : ''}. Gunakan pengetahuan akademik umum untuk memberikan jawaban yang komprehensif.`
              : `Generate FAQs${query ? ` for the topic: "${query}"` : ''}. Use general academic knowledge to provide comprehensive answers.`
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
        language,
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
