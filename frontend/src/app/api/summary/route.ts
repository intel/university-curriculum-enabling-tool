// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOllama } from 'ollama-ai-provider'
import { generateObject, CoreMessage } from 'ai'
import { errorResponse } from '@/lib/api-response'
import { hybridSearch } from '@/lib/chunk/hybrid-search'
import { generateEmbeddings } from '@/lib/embedding/generate-embedding'
import { cosineSimilarity } from 'ai'
import { ClientSource } from '@/lib/types/client-source'
import { ContextChunk } from '@/lib/types/context-chunk'

// Type definitions for summary content
interface ContentBlock {
  type: string
  level?: number
  text?: string
  content?: unknown
  items?: unknown[]
  ordered?: boolean
  [key: string]: unknown
}

interface SummaryObject {
  title?: string
  content?: ContentBlock[]
  conclusion?: string
  [key: string]: unknown
}

interface ChunkReference {
  chunk: string
  chunkIndex: number
  sourceId: number
  order: number
  score: number
  highlightedSentenceIndices: number[]
  highlightedSentences?: string[]
}

// Type for citation block after embedding is added
interface CitationBlockWithEmbedding {
  type: string
  content: string
  blockIdx: number
  itemIdx?: number
  embedding: number[]
  references?: ChunkReference[]
}

// Type for chunk after embedding is added (extends ContextChunk)
interface ContextChunkWithEmbedding extends ContextChunk {
  embedding: number[]
}

// Default values
const TEMPERATURE = parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const chunkSizeToken = Number(process.env.RAG_EMBEDDING_CHUNK_SIZE_TOKEN) || 200
const chunkOverlapToken = Number(process.env.RAG_EMBEDDING_CHUNK_OVERLAP_TOKEN) || 50
const TOKEN_RESPONSE_BUDGET = 2048
const semanticWeight = 0.5
const keywordWeight = 0.5
const topK = 5
const topN = 3
const useReranker = false
const similarityThreshold = 0.8

export async function POST(req: Request) {
  const { selectedModel, selectedSources, courseInfo } = await req.json()

  // Check if we have valid sources
  const hasValidSources =
    Array.isArray(selectedSources) &&
    selectedSources.length > 0 &&
    selectedSources.every(
      (source) => source && typeof source === 'object' && 'id' in source && 'name' in source,
    )

  // --- VALIDATION: Ensure either sources OR course info is provided ---
  if (!hasValidSources && !courseInfo?.courseName && !courseInfo?.courseDescription) {
    console.warn('DEBUG: No sources or course information provided in POST /api/summary')
    return errorResponse('Either sources or course information must be provided.', null, 400)
  }

  const ollamaUrl = process.env.OLLAMA_URL
  if (!ollamaUrl) {
    console.error('DEBUG: OLLAMA_URL is not defined in environment variables.')
    throw new Error('OLLAMA_URL is not defined in environment variables.')
  }
  const ollama = createOllama({ baseURL: ollamaUrl + '/api' })

  try {
    // Use hybrid search to get top chunks for summary generation (only if source is selected)
    let keyword = 'summary of '
    let topChunks: ContextChunk[] = []

    if (hasValidSources) {
      if (Array.isArray(selectedSources) && selectedSources.length > 0) {
        keyword += selectedSources.map((s: ClientSource) => s.name || s.id || 'source').join(', ')
      } else {
        keyword += 'selected sources'
      }

      topChunks = await hybridSearch(
        keyword,
        selectedSources,
        semanticWeight,
        keywordWeight,
        topK,
        useReranker,
      )

      // DEBUG: Top chunks from hybrid search used for summary generation
      console.debug('DEBUG: Top chunks from hybrid search used for summary generation:')
      topChunks.forEach((chunk, idx) => {
        console.debug(
          `DEBUG: Chunk #${idx + 1} (sourceId: ${chunk.sourceId}, order: ${chunk.order}):\n${chunk.chunk}\n`,
        )
      })
    } else {
      console.log('No valid sources provided, will generate using course context')
    }

    const topChunkContent = hasValidSources
      ? topChunks.map((chunk) => chunk.chunk).join('\n\n')
      : ''

    const SystemPrompt = `You are a world-class academic summarizer. Your job is to generate a highly detailed, 
    well-structured, and interesting summary for students, based ${hasValidSources ? 'strictly on the provided context' : `on general academic knowledge${courseInfo?.courseName ? ` for the course "${courseInfo.courseName}"` : ''}${courseInfo?.courseDescription ? `. Course context: ${courseInfo.courseDescription}` : ''}`}.

INSTRUCTIONS:
- The summary must be comprehensive, with clear hierarchy (multiple heading levels, sections, and subsections).
- Use a variety of heading levels (1, 2, 3) to organize the content, and ALWAYS use meaningful, 
content-based section titles for each heading (e.g., "Architecture Overview", "Performance Improvements", 
"Software Integration"). Do NOT use generic titles like "heading 1", "heading 2", etc.
- Use paragraphs for explanations, and both ordered and unordered lists for key points.
- Make the summary highly detailed, with technical depth, examples, and clear explanations. 
Include all relevant facts, numbers, and comparisons from ${hasValidSources ? 'the context' : 'your knowledge'}.
- Do NOT use any markdown or bold/italic formatting (such as **, __, *, _ or similar) in any field.
- Do NOT use any special formatting for headings or titles; just provide plain text for all fields.
- Make the summary engaging and easy to scan, with short sections and clear structure.
- Do NOT include images, tables, or charts.
- Do NOT use markdown in the title.
- Do NOT return any text outside the JSON object.
- Each heading must have a descriptive, content-based title. Do NOT use generic titles like "heading 1", "heading 2", etc.

RESPONSE FORMAT:
Return your response as a JSON object with this structure:
{
  "title": string, // The title of the summary (plain text, no markdown)
  "content": [
    // Array of content blocks, each block is one of:
    { "type": "heading", "level": 1|2|3, "text": string },
    { "type": "paragraph", "text": string },
    { "type": "list", "ordered": true|false, "items": [string, ...] }
  ],
  "conclusion": string // Short conclusion
}
CRITICAL: Your response MUST be valid JSON only. Do not include any text, markdown, explanations, or other content outside the JSON object. Do not include backticks or code block markers.`

    const UserPrompt = hasValidSources
      ? `Generate a highly detailed, structured, and interesting summary of the provided academic content. Use the format and instructions above. The summary should:
- Start with a clear, descriptive title (no markdown)
- Use multiple heading levels (1, 2, 3) for sections and subsections
- Include both paragraphs and lists (ordered and unordered)
- Do NOT use any markdown or bold/italic formatting (such as **, __, *, _ or similar) in any field.
- Be comprehensive, but concise and easy to scan
- Include as much technical detail, facts, and examples as possible from the context. Do not omit any important information.
- End with a short, insightful conclusion
If you do not use at least two heading levels and at least one list, your answer will be considered incomplete.`
      : `Generate a highly detailed, structured, and interesting summary${courseInfo?.courseName ? ` for students in ${courseInfo.courseName}` : ''}. ${courseInfo?.courseDescription ? `Use this course context to guide your summary: ${courseInfo.courseDescription}. ` : ''}The summary should:
- Start with a clear, descriptive title (no markdown)
- Use multiple heading levels (1, 2, 3) for sections and subsections
- Include both paragraphs and lists (ordered and unordered)
- Do NOT use any markdown or bold/italic formatting (such as **, __, *, _ or similar) in any field.
- Be comprehensive, but concise and easy to scan
- Include as much technical detail, facts, and examples as possible from general academic knowledge. Do not omit any important information.
- End with a short, insightful conclusion
If you do not use at least two heading levels and at least one list, your answer will be considered incomplete.`

    const systemMessage: CoreMessage = { role: 'system', content: SystemPrompt }
    const userMessage: CoreMessage = { role: 'user', content: UserPrompt }

    // Combine messages - only include assistant message if source is selected
    const fullMessages = hasValidSources
      ? [systemMessage, { role: 'assistant', content: topChunkContent } as CoreMessage, userMessage]
      : [systemMessage, userMessage]

    const startFinalSummarizeTime = Date.now()
    const { object: summaryObj, usage: finalUsage } = await generateObject({
      model: ollama(selectedModel, { numCtx: TOKEN_RESPONSE_BUDGET }),
      output: 'no-schema',
      messages: fullMessages,
      temperature: TEMPERATURE,
      maxTokens: TOKEN_RESPONSE_BUDGET,
    })
    const endFinalSummarizeTime = Date.now()
    const finalTimeTakenMs = endFinalSummarizeTime - startFinalSummarizeTime
    const finalTimeTakenSeconds = finalTimeTakenMs / 1000
    const finalTotalTokens = finalUsage.completionTokens
    const finalTokenGenerationSpeed = finalTotalTokens / finalTimeTakenSeconds

    console.log(
      `Progress: 100.00 % | ` +
        `Tokens: ` +
        `promptEst(?) ` +
        `prompt(${finalUsage.promptTokens}) ` +
        `completion(${finalUsage.completionTokens}) | ` +
        `${finalTokenGenerationSpeed.toFixed(2)} t/s | ` +
        `Duration: ${finalTimeTakenSeconds} s`,
    )

    console.log('DEBUG: LLM summary JSON object:', summaryObj)

    // Post processing: ensure summaryObj is a valid object
    function isSummaryObject(obj: unknown): obj is SummaryObject {
      return (
        obj !== null &&
        typeof obj === 'object' &&
        ('title' in obj || 'content' in obj || 'conclusion' in obj)
      )
    }

    // Helper: recursively extract all text from any object/array for robust flattening
    function extractText(obj: unknown): string {
      if (typeof obj === 'string') return obj
      if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj)
      if (Array.isArray(obj)) return obj.map(extractText).join(' ')
      if (obj && typeof obj === 'object') {
        let result = ''
        const record = obj as Record<string, unknown>
        if (typeof record.text === 'string') result += record.text + ' '
        if (typeof record.content === 'string') result += record.content + ' '
        if (Array.isArray(record.content)) result += record.content.map(extractText).join(' ')
        if (Array.isArray(record.items)) result += record.items.map(extractText).join(' ')
        for (const key in record) {
          if (
            typeof record[key] === 'string' ||
            typeof record[key] === 'number' ||
            typeof record[key] === 'boolean'
          ) {
            result += String(record[key]) + ' '
          } else if (
            Array.isArray(record[key]) ||
            (typeof record[key] === 'object' && record[key] !== null)
          ) {
            result += extractText(record[key]) + ' '
          }
        }
        return result.trim()
      }
      return ''
    }

    // Helper: flatten content blocks, recursively handle all nested objects/lists
    type Block = {
      type: string
      content: string
      level?: number
      ordered?: boolean
      items?: string[]
    }
    const blocks: Block[] = []
    function flattenBlocks(content: ContentBlock[], parentLevel = 1) {
      for (const block of content) {
        if (!block) continue
        if (block.type === 'heading' && typeof block.text === 'string') {
          blocks.push({ type: 'heading', content: block.text, level: block.level || parentLevel })
        } else if (block.type === 'paragraph' && typeof block.text === 'string') {
          blocks.push({ type: 'paragraph', content: block.text })
        } else if (block.type === 'list' && Array.isArray(block.items)) {
          const flatItems: string[] = block.items.map((item: unknown) =>
            typeof item === 'string' ? item : extractText(item),
          )
          blocks.push({ type: 'list', content: '', ordered: block.ordered, items: flatItems })
          for (const item of block.items) {
            if (
              typeof item === 'object' &&
              item !== null &&
              'type' in item &&
              (item.type === 'list' || item.type === 'section')
            ) {
              flattenBlocks([item as ContentBlock], parentLevel + 1)
            }
          }
        } else if (block.type === 'section' && Array.isArray(block.content)) {
          flattenBlocks(block.content as ContentBlock[], (block.level || parentLevel) + 1)
        } else if (typeof block === 'string') {
          blocks.push({ type: 'paragraph', content: block })
        } else if (typeof block === 'object' && block !== null) {
          if (Array.isArray(block.content)) {
            flattenBlocks(block.content as ContentBlock[], parentLevel + 1)
          } else if (Array.isArray(block.items)) {
            flattenBlocks(block.items as ContentBlock[], parentLevel + 1)
          } else if (typeof block.text === 'string') {
            blocks.push({ type: 'paragraph', content: block.text })
          } else {
            const text = extractText(block)
            if (text) blocks.push({ type: 'paragraph', content: text })
          }
        }
      }
    }

    // Start flattening the summaryObj content
    if (
      isSummaryObject(summaryObj) &&
      (summaryObj.title || summaryObj.content || summaryObj.conclusion)
    ) {
      if (summaryObj.title) {
        blocks.push({ type: 'heading', content: summaryObj.title, level: 1 })
      }
      if (Array.isArray(summaryObj.content) && summaryObj.content.length > 0) {
        // Filter out generic headings like 'heading 1', 'heading 2', etc.
        const filteredContent = summaryObj.content.filter(
          (block: ContentBlock) =>
            !(
              block.type === 'heading' &&
              typeof block.text === 'string' &&
              block.text
                .trim()
                .toLowerCase()
                .match(/^heading \d+$/)
            ),
        )
        flattenBlocks(filteredContent, 2)
      }
      const conclusionCount = blocks.filter(
        (block) =>
          block.type === 'heading' && block.content.trim().toLowerCase().includes('conclusion'),
      ).length

      if (conclusionCount > 0) {
        console.log(`DEBUG: Found ${conclusionCount} conclusion heading(s) in content blocks`)
      }

      if (summaryObj.conclusion) {
        console.log(`DEBUG: Also found conclusion in summaryObj.conclusion field`)
      }
      const hasExistingConclusion = blocks.some(
        (block) =>
          block.type === 'heading' && block.content.trim().toLowerCase().includes('conclusion'),
      )

      if (summaryObj.conclusion && !hasExistingConclusion) {
        console.log(`DEBUG: Adding conclusion from summaryObj.conclusion`)
        blocks.push({ type: 'heading', content: 'Conclusion', level: 2 })
        blocks.push({ type: 'paragraph', content: summaryObj.conclusion })
      } else if (summaryObj.conclusion && hasExistingConclusion) {
        console.log(`DEBUG: Not adding conclusion - already exists in content blocks`)
      } else if (!summaryObj.conclusion) {
        console.log(`DEBUG: No conclusion in summaryObj.conclusion field`)
      }
    } else {
      // fallback: treat as plain text, even if summaryObj is null/undefined
      const fallbackText = extractText(summaryObj)
      if (fallbackText && fallbackText.trim().length > 0) {
        blocks.push({ type: 'paragraph', content: fallbackText })
      } else {
        blocks.push({ type: 'paragraph', content: 'No summary content was generated.' })
      }
      console.warn(
        'WARNING: LLM summary object was missing or malformed. Fallback to plain text.',
        summaryObj,
      )
    }

    // Citation Logic (embedding-based, semantic similarity)
    // Helper: break paragraph into sentences (simple split, can be improved)
    function splitIntoSentences(text: string): string[] {
      return (
        text
          .match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)
          ?.map((s) => s.trim())
          .filter(Boolean) || []
      )
    }

    // Prepare citation blocks (split paragraphs/lists into sentences/items) - only if source is selected
    type CitationBlock = { type: string; content: string; blockIdx: number; itemIdx?: number }
    const citationBlocks: CitationBlock[] = []

    if (hasValidSources) {
      blocks.forEach((block, idx) => {
        if (block.type === 'paragraph') {
          const sentences = splitIntoSentences(block.content)
          sentences.forEach((sentence) => {
            citationBlocks.push({ type: 'sentence', content: sentence, blockIdx: idx })
          })
        } else if (block.type === 'list' && block.items) {
          block.items.forEach((item, i) => {
            citationBlocks.push({ type: 'list-item', content: item, blockIdx: idx, itemIdx: i })
          })
        }
      })
    }

    // Generate embeddings for each citation block (only if source is selected)
    const citationBlockEmbeddings = hasValidSources
      ? await Promise.all(
          citationBlocks.map(async (citationBlock) => {
            const emb = await generateEmbeddings(
              citationBlock.content,
              chunkSizeToken,
              chunkOverlapToken,
              process.env.RAG_EMBEDDING_MODEL,
            )
            return { ...citationBlock, embedding: emb[0]?.embedding || [] }
          }),
        )
      : []

    // Only get/generate embeddings for topK chunks (only if source is selected)
    const sourceChunkEmbeddings = hasValidSources
      ? await Promise.all(
          topChunks.map(async (chunk) => {
            // Always generate embedding for each topK chunk
            const embArr = await generateEmbeddings(
              chunk.chunk,
              chunkSizeToken,
              chunkOverlapToken,
              process.env.RAG_EMBEDDING_MODEL,
            )
            const embedding = embArr[0]?.embedding || []
            return {
              ...chunk,
              embedding,
            }
          }),
        )
      : []
    // Warn if any chunk is missing embedding
    sourceChunkEmbeddings.forEach((c, i) => {
      if (!Array.isArray(c.embedding) || c.embedding.length === 0) {
        console.warn(`DEBUG: No embedding found for chunk #${i} (order: ${c.order})`)
      }
    })

    // --- PRECOMPUTE ALL CHUNK SENTENCE EMBEDDINGS (async, batch) ---
    // Map: chunkKey (sourceId-chunkIndex) -> { sentences: string[], embeddings: number[][] }
    const chunkSentenceEmbeddingsMap: Record<
      string,
      { sentences: string[]; embeddings: number[][] }
    > = {}

    // Only precompute if we have sources
    if (hasValidSources) {
      for (const chunk of topChunks) {
        const sentences = splitIntoSentences(chunk.chunk)
        const embeddings: number[][] = []
        for (const sentence of sentences) {
          const embArr = await generateEmbeddings(
            sentence,
            chunkSizeToken,
            chunkOverlapToken,
            process.env.RAG_EMBEDDING_MODEL,
          )
          embeddings.push(embArr[0]?.embedding || [])
        }
        const chunkKey = `${chunk.sourceId}-${chunk.order}`
        chunkSentenceEmbeddingsMap[chunkKey] = { sentences, embeddings }
      }
    }

    // For each citation block, compute similarity to each topChunk, pick top-N with a strict threshold
    // Only do citation processing if we have sources
    const blockCitations = hasValidSources
      ? citationBlockEmbeddings.map((citationBlock: CitationBlockWithEmbedding) => {
          const scored = sourceChunkEmbeddings
            .map((chunk: ContextChunkWithEmbedding) => {
              const score =
                Array.isArray(chunk.embedding) &&
                chunk.embedding.length > 0 &&
                Array.isArray(citationBlock.embedding) &&
                citationBlock.embedding.length > 0
                  ? cosineSimilarity(citationBlock.embedding, chunk.embedding)
                  : 0
              return {
                chunk: chunk.chunk,
                chunkIndex: chunk.order,
                sourceId: chunk.sourceId || 0,
                order: chunk.order,
                score,
                highlightedSentenceIndices: [],
              }
            })
            .filter((ref: ChunkReference) => !isNaN(ref.score))
            .sort((a: ChunkReference, b: ChunkReference) => b.score - a.score)

          // Only keep those above threshold, then slice to top-N
          const filtered = scored
            .filter((ref: ChunkReference) => ref.score >= similarityThreshold)
            .slice(0, topN)
          // Fallback: if none meet threshold but scored exists, include top-1
          const finalRefs = filtered.length > 0 ? filtered : scored.length > 0 ? [scored[0]] : []
          return { ...citationBlock, references: finalRefs }
        })
      : []

    // Aggregate citations back to blocks
    const citations = blocks.map((block, idx) => {
      if (block.type === 'heading') {
        return { ...block, references: [] }
      }
      if (block.type === 'list' && block.items) {
        // For lists, do not attach references (no citation button for list items)
        return { ...block, references: [] }
      }
      if (block.type === 'paragraph') {
        // For each sentence, attach top-N citations, but aggregate for the whole paragraph (only if source is selected)
        if (!hasValidSources) {
          return { ...block, references: [] }
        }
        const paraSentences = splitIntoSentences(block.content)
        const sentRefs = paraSentences.map((sentence) => {
          const found = blockCitations.find(
            (citationBlock) => citationBlock.blockIdx === idx && citationBlock.content === sentence,
          )
          return found ? found.references : []
        })
        // Deduplicate and order all refs for the paragraph
        const allRefs = sentRefs.flat().sort((a, b) => b.score - a.score)
        const deduped = []
        const seen = new Set()
        for (const ref of allRefs) {
          const key = `${ref.sourceId}-${ref.chunkIndex}`
          if (!seen.has(key)) {
            deduped.push(ref)
            seen.add(key)
          }
        }
        // Always show at least one citation if any exist for this paragraph
        if (deduped.length === 0 && allRefs.length > 0) {
          deduped.push(allRefs[0])
        }
        // --- Build sentenceCitationMap for frontend highlighting ---
        // Map: citationKey (sourceId-chunkIndex) -> [sentenceIdx, ...]
        const sentenceCitationMap: Record<string, number[]> = {}
        paraSentences.forEach((sentence, sidx) => {
          const found = blockCitations.find(
            (citationBlock: CitationBlockWithEmbedding) =>
              citationBlock.blockIdx === idx && citationBlock.content === sentence,
          )
          if (found && found.references) {
            found.references.forEach((ref: ChunkReference) => {
              const key = `${ref.sourceId}-${ref.chunkIndex}`
              if (!sentenceCitationMap[key]) sentenceCitationMap[key] = []
              sentenceCitationMap[key].push(sidx)
            })
          }
        })
        // --- Add highlightedSentences to each reference ---
        const referencesWithHighlights = deduped.map((ref) => {
          // Find the chunk sentences for this reference
          const chunkKey = `${ref.sourceId}-${ref.chunkIndex}`
          const chunkSentences = chunkSentenceEmbeddingsMap[chunkKey]?.sentences || []
          // Use highlightedSentenceIndices to get the actual sentences
          const highlightedSentenceIndices = Array.isArray(ref.highlightedSentenceIndices)
            ? ref.highlightedSentenceIndices
            : []
          const highlightedSentences = highlightedSentenceIndices
            .map((i: number) => chunkSentences[i])
            .filter(Boolean)
          return { ...ref, highlightedSentenceIndices, highlightedSentences }
        })
        return { ...block, references: referencesWithHighlights, sentenceCitationMap }
      }
      // fallback
      return { ...block, references: [] }
    })
    // Enhanced DEBUG: show block, references, and similarity scores
    console.log('\n===== CITATION DEBUG OUTPUT =====')
    blocks.forEach((block, i) => {
      console.log(`\nBlock #${i} [${block.type}]`)
      if (block.type === 'paragraph') {
        console.log(`Content: ${block.content}`)
        const paraSentences = splitIntoSentences(block.content)
        paraSentences.forEach((sentence, sidx) => {
          const found = blockCitations.find(
            (citationBlock: CitationBlockWithEmbedding) =>
              citationBlock.blockIdx === i && citationBlock.content === sentence,
          )
          if (found) {
            console.log(`  Sentence #${sidx + 1}: ${sentence}`)
            if (found.references && found.references.length > 0) {
              found.references.forEach((ref: ChunkReference, ridx: number) => {
                console.log(
                  `    Ref #${ridx + 1}: [sourceId=${ref.sourceId}, chunkIndex=${ref.chunkIndex}, score=${ref.score?.toFixed(3)}]`,
                )
              })
            } else {
              console.log('    No references found for this sentence.')
            }
          } else {
            console.log(`  Sentence #${sidx + 1}: ${sentence} (no citation block found)`)
          }
        })
      } else if (block.type === 'list' && block.items) {
        block.items.forEach((item, lidx) => {
          const found = blockCitations.find(
            (citationBlock) => citationBlock.blockIdx === i && citationBlock.itemIdx === lidx,
          )
          console.log(`  List item #${lidx + 1}: ${item}`)
          if (found && found.references && found.references.length > 0) {
            found.references.forEach((ref: ChunkReference, ridx: number) => {
              console.log(
                `    Ref #${ridx + 1}: [sourceId=${ref.sourceId}, chunkIndex=${ref.chunkIndex}, score=${ref.score?.toFixed(3)}]`,
              )
            })
          } else {
            console.log('    No references found for this list item.')
          }
        })
      } else {
        console.log(`Content: ${block.content}`)
        console.log('  (No citations for this block type)')
      }
    })
    console.log('\n===== END CITATION DEBUG =====\n')
    // --- MARKDOWN POST-PROCESSING (IMPROVED: ADD ** TO HEADINGS, #/##/### FOR LEVELS) ---
    function renderMarkdownWithBlocks(blocks: Block[]): string {
      let md = ''
      let currentBlock: Block[] = []
      const flushBlock = () => {
        if (currentBlock.length === 0) return
        for (const block of currentBlock) {
          if (block.type === 'heading') {
            continue
          } else if (block.type === 'paragraph') {
            md += block.content + '\n\n'
          } else if (block.type === 'list' && block.items) {
            if (block.ordered) {
              md +=
                block.items.map((item, i) => `${i + 1}. ${extractText(item)}`).join('\n') + '\n\n'
            } else {
              md += block.items.map((item) => `- ${extractText(item)}`).join('\n') + '\n\n'
            }
          }
        }
        md += '\n'
        currentBlock = []
      }
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        if (block.type === 'heading') {
          flushBlock()
          let hashes = ''
          const headingContent = block.content.replace(/\*\*/g, '')
          if (block.level === 1) {
            hashes = '#'
          } else if (block.level === 2) {
            hashes = '##'
          } else if (block.level === 3) {
            hashes = '###'
          } else {
            hashes = '##'
          }
          md += `${hashes} **${headingContent}**\n\n`
        } else if (block.type === 'heading-title') {
          const titleContent = block.content.replace(/\*\*/g, '')
          md += `# **${titleContent}**\n\n`
        } else {
          currentBlock.push(block)
        }
      }
      flushBlock()
      return md.replace(/\n{3,}/g, '\n\n')
    }

    // Insert a special heading-title block for the title, and avoid duplicate Conclusion
    let processedBlocks: Block[] = []
    const hasConclusionHeading = blocks.some(
      (b) => b.type === 'heading' && b.content.trim().toLowerCase() === 'conclusion',
    )
    // --- HIERARCHY IMPROVEMENT LOGIC ---
    // 1. Always insert a level 1 title as heading-title
    // 2. Ensure at least two level 2 headings (sections)
    // 3. Promote first paragraph after title to an Introduction section if not already present
    // 4. Group related blocks under headings if possible (simple heuristic)
    function ensureHierarchy(blocks: Block[]): Block[] {
      let out: Block[] = []
      let idx = 0
      // 1. Title
      if (blocks.length > 0 && blocks[0].type === 'heading' && blocks[0].level === 1) {
        out.push({ ...blocks[0], type: 'heading-title', level: 1 })
        idx = 1
      }
      // 2. Scan for level 2 headings after the title
      let hasLevel2 = false
      for (let i = idx; i < blocks.length; i++) {
        if (blocks[i] && blocks[i].type === 'heading' && blocks[i].level === 2) {
          hasLevel2 = true
          break
        }
      }
      // 3. If no level 2 headings, insert 'Overview' before first paragraph (if present)
      if (!hasLevel2) {
        if (blocks[idx] && blocks[idx].type === 'paragraph') {
          out.push({ type: 'heading', content: 'Overview', level: 2 })
          out.push(blocks[idx])
          idx++
        }
        // Add the rest of the blocks, converting h3/higher to h2
        for (let i = idx; i < blocks.length; i++) {
          let b = blocks[i]
          if (b && b.type === 'heading' && (b.level ?? 2) > 2) {
            b = { ...b, level: 2 }
          }
          if (b) out.push(b)
        }
      } else {
        // 4. Otherwise, preserve all blocks, only convert h3/higher to h2
        for (let i = idx; i < blocks.length; i++) {
          let b = blocks[i]
          if (b && b.type === 'heading' && (b.level ?? 2) > 2) {
            b = { ...b, level: 2 }
          }
          if (b) out.push(b)
        }
      }
      // 5. Remove all but the last 'Conclusion' heading and its following paragraph
      let lastConclusionIdx = -1
      for (let i = 0; i < out.length; i++) {
        if (out[i].type === 'heading' && out[i].content.trim().toLowerCase() === 'conclusion') {
          lastConclusionIdx = i
        }
      }
      if (lastConclusionIdx !== -1) {
        // Remove all previous 'Conclusion' headings and their following paragraph (if any)
        const filtered: Block[] = []
        for (let i = 0; i < out.length; ) {
          if (
            out[i].type === 'heading' &&
            out[i].content.trim().toLowerCase() === 'conclusion' &&
            i !== lastConclusionIdx
          ) {
            // Skip this heading and the next paragraph if present
            i++
            if (i < out.length && out[i].type === 'paragraph') i++
          } else {
            filtered.push(out[i])
            i++
          }
        }
        out = filtered
      }
      return out
    }
    processedBlocks = ensureHierarchy(blocks)
    // Remove extra conclusion heading/paragraph if already present
    if (hasConclusionHeading) {
      processedBlocks = processedBlocks.filter(
        (b, i, arr) =>
          !(
            b.type === 'heading' &&
            b.content.trim().toLowerCase() === 'conclusion' &&
            arr.findIndex(
              (x) => x.type === 'heading' && x.content.trim().toLowerCase() === 'conclusion',
            ) !== i
          ),
      )
    }
    const processedMarkdown = renderMarkdownWithBlocks(processedBlocks)
    return new Response(JSON.stringify({ summary: processedMarkdown, citations }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in summary generation:', error)
    return errorResponse('An unexpected error occurred', null, 500)
  }
}
