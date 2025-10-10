// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOllama } from 'ollama-ai-provider-v2'
import { streamText, ModelMessage } from 'ai'
import { errorHandler } from '@/lib/handler/error-handler'
import { retrieveContextByEmbedding } from '@/lib/assistant/retrieve-context-by-embedding'
import { effectiveTokenCountForText } from '@/lib/utils'
import { getMostRelevantImage } from '@/lib/embedding/get-most-relevant-image'
import { extractTextFromMessage } from '@/lib/utils/message'
import { getPayload } from 'payload'
import config from '@payload-config'

// export const runtime = "edge";
export const dynamic = 'force-dynamic'

// Default values
const TEMPERATURE = parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const TOP_K = parseInt(process.env.RAG_CONTEXT_SIMILARITY_TOP_K ?? '5')
const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_CONTEXT_SIMILARITY_THRESHOLD || '0.7')
const TOKEN_MAX = parseInt(process.env.RAG_TOKEN_MAX ?? '1024')
const TOKEN_RESPONSE_RATIO = parseFloat(process.env.RAG_TOKEN_RESPONSE_RATIO || '0.6')
const TOKEN_RESPONSE_BUDGET = Math.floor(TOKEN_MAX * TOKEN_RESPONSE_RATIO)
const TOKEN_CONTEXT_BUDGET = TOKEN_MAX - TOKEN_RESPONSE_BUDGET

/**
 * Handles POST requests to the API route.
 *
 * This function processes incoming requests, retrieves relevant context
 * based on the user query, and streams an AI-generated response using
 * the Ollama provider.
 *
 * @param req - The incoming request object.
 * @returns A promise that resolves to a response object.
 */
export async function POST(req: Request) {
  const { messages, selectedModel, selectedSources, data, language } = await req.json()
  console.log('DEBUG: CHAT API selectedModel:', selectedModel)

  // Handle legacy image data for backward compatibility
  const legacyImages = data?.images || []
  console.log('DEBUG: Legacy images count:', legacyImages.length)

  // Prepare: Ollama provider
  const ollamaUrl = process.env.OLLAMA_URL
  if (!ollamaUrl) {
    throw new Error('OLLAMA_URL is not defined in environment variables.')
  }
  const ollama = createOllama({ baseURL: ollamaUrl + '/api' })

  // Prepare: Calculate the total number of selected sources
  // const totalSelectedSources = selectedSources.filter(
  //   (source: ClientSource) => source.selected
  // ).length
  // console.log("Total Size of Selected Sources:", totalSelectedSources)

  console.log(`DEBUG: Similarity threshold: ${SIMILARITY_THRESHOLD}`)
  console.log(`DEBUG: topK: ${TOP_K}`)
  console.log(`DEBUG: TOKEN_MAX: ${TOKEN_MAX}`)
  console.log(`DEBUG: TOKEN_RESPONSE_RATIO: ${TOKEN_RESPONSE_RATIO}`)

  // Step 1: Extract attachments and convert to coreMessages
  console.log('DEBUG: Raw messages received:', JSON.stringify(messages, null, 2))

  // Extract image attachments from messages
  const messageImages: string[] = []
  messages.forEach((msg: unknown, idx: number) => {
    const m = msg as Record<string, unknown>

    if (m.attachments && Array.isArray(m.attachments)) {
      m.attachments.forEach((attachment: unknown) => {
        const att = attachment as Record<string, unknown>
        if (
          att.contentType &&
          typeof att.contentType === 'string' &&
          att.contentType.startsWith('image/')
        ) {
          if (att.url && typeof att.url === 'string') {
            messageImages.push(att.url)
          }
        }
      })
    }

    console.log(`DEBUG: Message ${idx}:`, {
      role: m.role,
      hasContent: !!m.content,
      hasParts: !!m.parts,
      hasAttachments: !!m.attachments,
      attachmentsCount: Array.isArray(m.attachments) ? m.attachments.length : 0,
      partsLength: Array.isArray(m.parts) ? m.parts.length : 0,
      partsTypes: Array.isArray(m.parts)
        ? m.parts.map((p: unknown) => (p as Record<string, unknown>)?.type)
        : [],
    })
  })

  // Combine all images (message attachments + legacy)
  const allImages = [...messageImages, ...legacyImages]
  console.log('DEBUG: Total images available:', allImages.length)

  // Step 2: Extract the latest user query
  const originalLatestMessage = messages[messages.length - 1]
  let latestQuery = ''

  // Handle 'parts' structure
  if (originalLatestMessage?.parts && Array.isArray(originalLatestMessage.parts)) {
    interface MessagePart {
      type: string
      text?: string
    }
    const textPart = originalLatestMessage.parts.find(
      (part: unknown): part is MessagePart =>
        typeof part === 'object' && part !== null && (part as MessagePart).type === 'text',
    )
    latestQuery = textPart?.text || ''
  }

  // Fallback: try the utility function for complex extraction
  if (!latestQuery) {
    latestQuery = extractTextFromMessage(originalLatestMessage)
    console.log('DEBUG: Extracted using utility function')
  }

  if (!latestQuery) {
    console.warn('Could not extract text from latest message:', {
      originalLatestMessage,
    })
  }

  console.log('DEBUG: Final extracted latestQuery:', latestQuery)

  // Step 2.5: Check if any sources are selected and valid
  const hasSelectedSources =
    Array.isArray(selectedSources) &&
    selectedSources.length > 0 &&
    selectedSources.every(
      (source) => source && typeof source === 'object' && 'id' in source && 'name' in source,
    )

  // Step 3: Find the most relevant image (only if sources are selected)
  let mostRelevantImageMarkdown = ''
  if (hasSelectedSources) {
    try {
      const mostRelevantImage = await getMostRelevantImage(latestQuery, selectedSources)
      const payload = await getPayload({ config })
      if (mostRelevantImage) {
        const mediaData = await payload.find({
          collection: 'media',
          where: {
            filename: {
              equals: mostRelevantImage.filename,
            },
          },
        })

        if (mediaData.docs && mediaData.docs.length > 0) {
          const media = mediaData.docs[0]
          const imageUrl = `/api/media/file/${media.filename}`
          mostRelevantImageMarkdown = `![${media.filename}](${imageUrl})`
          console.log('DEBUG: Most relevant image markdown:', mostRelevantImageMarkdown)
        } else {
          console.log('DEBUG: No media found for the query.')
        }
      } else {
        console.log('DEBUG: No relevant image found.')
      }
    } catch (error) {
      console.error('Error finding the most relevant image:', error)
    }
  }

  const languageDirective =
    language === 'id' ? 'Selalu balas dalam Bahasa Indonesia.' : 'Always reply in English.'

  const systemPrompt =
    language === 'id'
      ? `
Anda adalah asisten AI percakapan yang andal dan berpengetahuan.
${languageDirective}
Pedoman Umum:
Gunakan HANYA informasi yang disediakan di bawah ini untuk jawaban Anda.
Jika diperlukan daftar, tampilkan jumlah item alih-alih bullet.
JANGAN menyimpulkan atau menghasilkan informasi di luar data yang diberikan.
Jika konteks relevan tersedia, jelaskan bahwa jawaban Anda didasarkan pada informasi tersebut.
Jika tidak ada konteks yang tersedia, balas dengan:
"Saya tidak memiliki cukup informasi untuk menjawab pertanyaan tersebut."
Namun, bila memungkinkan, berikan juga sesuatu yang terkait dengan pertanyaan untuk tetap membantu dan natural.
Jika pengguna ingin detail lebih lanjut, tanyakan apakah mereka ingin mengeksplorasi topik tersebut lebih jauh.
Pastikan jawaban Anda selalu berbasis pada pengetahuan yang disediakan dan, bila tepat, rujuk bagian spesifik darinya.
${
  mostRelevantImageMarkdown
    ? `Selalu sertakan markdown gambar relevan ini: ${mostRelevantImageMarkdown} dalam jawaban Anda.
Posisikan markdown gambar: ${mostRelevantImageMarkdown} secara tepat dalam jawaban untuk meningkatkan kejelasan dan relevansi.
Hindari penggunaan tag gambar HTML seperti <img> dalam jawaban.
Jika pertanyaan secara khusus meminta representasi visual, prioritaskan menyertakan markdown gambar di awal jawaban.`
    : ''
}

Tambahkan di akhir jawaban bagian singkat berlabel "Ringkasan penalaran:" yang:
- Merangkum pendekatan Anda secara tingkat tinggi (tanpa langkah-langkah rinci).
- Menyebutkan sumber/bagian yang dirujuk (judul atau ID jika ada).
- Menyebutkan asumsi/keterbatasan yang relevan.
Batasi hingga 2–3 butir. Jangan mengungkap rantai penalaran internal atau langkah-langkah tersembunyi.
`
      : `
You are a knowledgeable and reliable AI chat assistant.
${languageDirective}
General Guidelines:
Use ONLY the information provided below for your responses.
If a list of items is required, show the number of items instead of bullets.
Do NOT infer or generate information beyond the given data.
If relevant context is provided, make it clear that your response is based on that information.
If no context is available, respond with:
"I don't have enough information to answer that question."
However, when possible, also provide something related to the query to keep the response helpful and natural.
If the user wants more details, ask if they'd like to explore the topic further.
Ensure that your answer is strictly based on the provided knowledge and, when appropriate, reference specific parts of it.
${
  mostRelevantImageMarkdown
    ? `Always include this relevant image query markdown: ${mostRelevantImageMarkdown} in your response.
Position the image markdown: ${mostRelevantImageMarkdown} appropriately within your answer to enhance clarity and relevance.
Avoid using HTML image tags such as <img> in your response.
If the query specifically asks for a visual representation, prioritize including the image markdown early in your response.`
    : ''
}

At the end of the answer, add a short section labeled "Reasoning summary:" that:
- Summarizes your high-level approach (no detailed steps).
- Mentions the sources/sections referenced (titles or IDs if available).
- Notes any relevant assumptions/limitations.
Keep it to 2–3 bullets. Do not reveal internal chain-of-thought or hidden step-by-step reasoning.
`

  const systemMessage: ModelMessage = {
    role: 'system',
    content: systemPrompt,
  }

  // Token count estimation
  let usedTokens =
    effectiveTokenCountForText(systemPrompt) + effectiveTokenCountForText(latestQuery)
  let chunkContent = ''
  let chunksAdded = 0
  let assistantContent = ''

  // Step 4: Retrieve and filter knowledge chunks
  try {
    // Retrieves context based on user query embedding and stored embeddings.
    const retrievedChunks = await retrieveContextByEmbedding(latestQuery, selectedSources, TOP_K)
    console.log('DEBUG: retrievedChunks total:', retrievedChunks.length)

    // Log similarity and order info for debugging
    const similarityAndOrderList = retrievedChunks.map((chunk) => ({
      similarity: chunk.similarity,
      order: chunk.order,
      sourceId: chunk.sourceId,
    }))
    console.log('DEBUG: Similarity and Order List:', similarityAndOrderList)

    // Loop through retrieved chunks, summing effective token counts.
    for (const chunk of retrievedChunks) {
      const chunkTokenCount = effectiveTokenCountForText(chunk.chunk)
      // console.log(
      //   `DEBUG: chat API chunk token ${chunk.order}/${retrievedChunks.length} effective count:`,
      //   chunkTokenCount
      // );
      if (usedTokens + chunkTokenCount <= TOKEN_CONTEXT_BUDGET) {
        chunkContent += `\n\n${chunk.chunk}`
        usedTokens += chunkTokenCount
        chunksAdded++
      } else {
        break // Stop adding chunks if exceeding token budget
      }
    }
    //" I should always return this in my answer : " + imageresult.text + ". Chunk content start here : " +
    assistantContent = chunkContent || 'No relevant knowledge found.'
    console.log(
      `Total Chunks: ${chunksAdded}/${retrievedChunks.length} | ` +
        `Prompt tokens: ` +
        `system(${effectiveTokenCountForText(systemMessage.content.toString())}) ` +
        `user(${effectiveTokenCountForText(latestQuery)}) ` +
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

  // Step 5: Prepare full messages - convert all to consistent ModelMessage format
  // First, create UI-format messages for system and assistant, then convert everything together
  const uiSystemMessage = {
    id: 'system-1',
    role: 'system',
    content: systemMessage.content,
  }

  const uiAssistantMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: assistantContent,
  }

  // Combine all messages in UI format, then convert to ModelMessage format for provider
  console.log('DEBUG: Before combining - uiSystemMessage:', uiSystemMessage)
  console.log('DEBUG: Before combining - uiAssistantMessage:', uiAssistantMessage)
  console.log('DEBUG: Before combining - messages:', JSON.stringify(messages, null, 2))

  // Validate and clean messages before combining
  const validatedMessages = messages.filter((msg: unknown) => {
    const m = msg as Record<string, unknown>
    if (!msg || typeof msg !== 'object' || !m.role) {
      console.warn('DEBUG: Filtering out invalid message:', msg)
      return false
    }
    // Ensure parts array exists if it's a user message with parts structure
    if (m.parts && !Array.isArray(m.parts)) {
      console.warn('DEBUG: Message has invalid parts (not array):', msg)
      return false
    }
    // Ensure attachments array exists if specified
    if (m.attachments && !Array.isArray(m.attachments)) {
      console.warn('DEBUG: Message has invalid attachments (not array):', msg)
      return false
    }
    return true
  })

  const allUIMessages = [uiSystemMessage, uiAssistantMessage, ...validatedMessages]

  console.log('DEBUG: allUIMessages after validation:', JSON.stringify(allUIMessages, null, 2))
  console.log('DEBUG: allUIMessages length:', allUIMessages.length)

  if (allUIMessages.length === 0) {
    throw new Error('No valid messages found after validation')
  }

  // Try manual conversion first to avoid the convertToModelMessages error
  console.log('DEBUG: Using manual message conversion for better compatibility...')
  const fullMessages: ModelMessage[] = allUIMessages.map((msg, index) => {
    const m = msg as Record<string, unknown>
    console.log(`DEBUG: Converting message ${index}:`, {
      role: m.role,
      hasContent: !!m.content,
      hasParts: !!m.parts,
      partsLength: Array.isArray(m.parts) ? m.parts.length : 0,
      partsStructure: Array.isArray(m.parts)
        ? m.parts.map((p: unknown) => {
            const part = p as Record<string, unknown>
            return {
              type: part?.type,
              hasText: !!part?.text,
              textLength: typeof part?.text === 'string' ? part.text.length : 0,
            }
          })
        : 'no parts',
    })

    if (m.parts && Array.isArray(m.parts) && m.parts.length > 0) {
      const textParts: string[] = []

      for (const part of m.parts) {
        if (!part || typeof part !== 'object') continue

        const p = part as Record<string, unknown>
        console.log(`DEBUG: Processing part:`, { type: p.type, hasText: !!p.text, text: p.text })

        if (p.type === 'text' && typeof p.text === 'string' && p.text.trim()) {
          textParts.push(p.text.trim())
        }
      }

      const content = textParts.length > 0 ? textParts.join('\n') : ''
      console.log(`DEBUG: Extracted content from parts:`, {
        contentLength: content.length,
        content: content.substring(0, 100) + '...',
      })

      if (!content) {
        // Fallback: try extractTextFromMessage utility
        const fallbackContent = extractTextFromMessage(msg)
        console.log(`DEBUG: Fallback extraction result:`, {
          fallbackLength: fallbackContent.length,
        })
        return {
          role: m.role as 'user' | 'assistant' | 'system',
          content: fallbackContent || '[Empty message]',
        }
      }

      return { role: m.role as 'user' | 'assistant' | 'system', content }
    } else if (m.content && typeof m.content === 'string') {
      // Handle regular message with content
      console.log(`DEBUG: Using direct content:`, { contentLength: m.content.length })
      return { role: m.role as 'user' | 'assistant' | 'system', content: m.content }
    } else {
      // Last resort: try the utility function
      const extractedContent = extractTextFromMessage(msg)
      console.log(`DEBUG: Last resort extraction:`, { extractedLength: extractedContent.length })
      return {
        role: m.role as 'user' | 'assistant' | 'system',
        content: extractedContent || '[Unable to extract content]',
      }
    }
  })
  console.log('DEBUG: Manual conversion completed, fullMessages length:', fullMessages.length)

  // Validate all messages have content
  const validatedFullMessages = fullMessages.filter((msg) => {
    const content = typeof msg.content === 'string' ? msg.content : String(msg.content || '')
    if (!content || content.trim() === '') {
      console.warn('DEBUG: Filtering out message with empty content:', msg)
      return false
    }
    return true
  })

  if (validatedFullMessages.length === 0) {
    throw new Error('No messages with valid content found')
  }

  console.log('DEBUG: latestQuery:', latestQuery)
  console.log(
    'DEBUG: validatedFullMessages after conversion:',
    JSON.stringify(validatedFullMessages, null, 2),
  )

  // Step 6: Stream AI response using Ollama
  const startTime = Date.now()
  const result = streamText({
    model: ollama(selectedModel),
    messages: validatedFullMessages,
    temperature: TEMPERATURE,
    maxOutputTokens: TOKEN_RESPONSE_BUDGET,
    providerOptions: {
      ollama: {
        mode: 'json',
        options: {
          numCtx: TOKEN_RESPONSE_BUDGET,
        },
      },
    },
    onError: (error) => {
      console.error(error)
    },
    onFinish({ usage }) {
      // End timing and calculate the time taken.
      const endTime = Date.now()
      const timeTakenMs = endTime - startTime
      const timeTakenSeconds = timeTakenMs / 1000

      // Guard for optional usage fields (provider may omit usage or only provide totalUsage via finish parts)
      const inputTokens = usage?.inputTokens ?? 0
      const outputTokens = usage?.outputTokens ?? 0
      const tokenGenerationSpeed = timeTakenSeconds > 0 ? outputTokens / timeTakenSeconds : 0

      console.log('onFinish usage:', usage)

      console.log(
        `Usage tokens: ` +
          `promptEst(${usedTokens}) ` +
          `prompt(${inputTokens}) ` +
          `completion(${outputTokens}) | ` +
          `${tokenGenerationSpeed.toFixed(2)} t/s | ` +
          `Duration: ${timeTakenSeconds.toFixed(2)} s`,
      )
    },
  })

  type FinishPart = {
    type: 'finish'
    totalUsage?: {
      inputTokens?: number
      outputTokens?: number
      totalTokens?: number
    }
  }

  return result.toUIMessageStreamResponse({
    onError: errorHandler,
    // Attach the totalUsage from the final 'finish' stream part to the UI message metadata
    // so clients using useChat can access it via message.metadata?.totalUsage
    messageMetadata: ({ part }: { part: FinishPart | { type: string } }) => {
      if (part.type === 'finish' && 'totalUsage' in part && part.totalUsage) {
        return { totalUsage: part.totalUsage }
      }
    },
  })
}
