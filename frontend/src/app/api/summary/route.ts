// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { getProviderInfo } from '@/lib/providers'
import { generateObject, ModelMessage } from 'ai'
import { errorResponse } from '@/lib/api-response'
import { hybridSearch } from '@/lib/chunk/hybrid-search'
import { generateEmbeddings } from '@/lib/embedding/generate-embedding'
import { cosineSimilarity } from 'ai'
import { ClientSource } from '@/lib/types/client-source'
import { ContextChunk } from '@/lib/types/context-chunk'
import { z } from 'zod'

const sectionSchema = z.object({
  heading: z.string().optional(), // Optional section heading
  content: z.string(), // Main paragraph content (required)
  bullet_points: z.array(z.string()).optional(), // Optional list items
  is_ordered_list: z.boolean().optional(), // If bullet_points present, is it ordered?
})

const summaryResponseSchema = z.object({
  title: z.string(), // Summary title
  sections: z.array(sectionSchema).min(1), // Array of sections
  conclusion: z.string().optional(), // Optional conclusion paragraph
})

// Type definitions for summary content (internal representation after normalization)
interface ContentBlock {
  type: string
  level?: number
  content: string
  items?: string[]
  ordered?: boolean
}

interface Section {
  heading?: string
  content: string
  bullet_points?: string[]
  is_ordered_list?: boolean
}

interface SummaryResponse {
  title: string
  sections: Section[]
  conclusion?: string
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

// Type for processed blocks used in citation and rendering
type Block = {
  type: string
  content: string
  level?: number
  ordered?: boolean
  items?: string[]
}

// Default values
const TEMPERATURE = parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const chunkSizeToken = Number(process.env.RAG_EMBEDDING_CHUNK_SIZE_TOKEN) || 200
const chunkOverlapToken = Number(process.env.RAG_EMBEDDING_CHUNK_OVERLAP_TOKEN) || 50
const TOKEN_RESPONSE_BUDGET = 4096 // Increased from 2048 to handle larger summaries
const semanticWeight = 0.5
const keywordWeight = 0.5
const topK = 5
const topN = 3
const useReranker = false
const similarityThreshold = 0.8

export async function POST(req: Request) {
  const { provider } = await getProviderInfo()
  const { selectedModel, selectedSources, courseInfo, language } = await req.json()

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

    const isID = language === 'id'
    const languageDirective = isID
      ? 'PENTING: Anda harus menghasilkan seluruh keluaran dalam Bahasa Indonesia.'
      : 'IMPORTANT: You must produce the entire output in English.'
    const overviewHeadingLabel = isID ? 'Ikhtisar' : 'Overview'
    const conclusionHeadingLabel = isID ? 'Kesimpulan' : 'Conclusion'
    const isConclusionHeadingText = (txt: string | undefined) => {
      if (!txt) return false
      const t = txt.trim().toLowerCase()
      return t === 'conclusion' || t === 'kesimpulan'
    }

    const strictnessDirective = hasValidSources
      ? isID
        ? 'SANGAT PENTING: Hanya gunakan konteks yang disediakan. Jangan menambahkan informasi yang tidak ada dalam konteks. Jika informasi tertentu tidak tersedia, abaikan bagian tersebut dan jangan menebak.'
        : 'CRITICAL: Use only the provided context. Do not add information that is not present in the context. If certain information is missing, omit that part rather than guessing.'
      : ''

    const SystemPrompt = `${languageDirective}\n\nYou are a world-class academic summarizer. Your job is to generate a highly detailed, 
    well-structured, and interesting summary for students, based ${hasValidSources ? 'strictly on the provided context' : `on general academic knowledge${courseInfo?.courseName ? ` for the course \"${courseInfo.courseName}\"` : ''}${courseInfo?.courseDescription ? `. Course context: ${courseInfo.courseDescription}` : ''}`}.

${strictnessDirective}

INSTRUCTIONS:
- The summary must be comprehensive with clear sections and subsections
- Each section should have a descriptive heading (e.g., "Architecture Overview", "Performance Improvements")
- Use paragraphs for explanations and bullet points for key facts
- Make the summary detailed with technical depth, examples, and clear explanations
- Include all relevant facts, numbers, and comparisons from ${hasValidSources ? 'the context' : 'your knowledge'}
- Do NOT use any markdown formatting (**, __, *, _) - use plain text only
- Do NOT include images, tables, or charts
- Aim for 5-10 main sections

RESPONSE FORMAT:
Return your response as a JSON object with this structure:
{
  "title": "Summary Title (plain text)",
  "sections": [
    {
      "heading": "Section Name (optional)",
      "content": "Main paragraph explaining this section",
      "bullet_points": ["Key point 1", "Key point 2"],  // optional
      "is_ordered_list": false  // optional, true for numbered lists
    }
  ],
  "conclusion": "Brief conclusion (optional)"
}

SCHEMA RULES:
- "content" field is REQUIRED for every section
- "heading", "bullet_points", and "is_ordered_list" are OPTIONAL
- You can mix sections with headings, content paragraphs, and bullet points
- Keep it focused to fit within token limits

CRITICAL: Your response MUST be valid JSON only. Do not include any text outside the JSON object.`

    const UserPrompt = hasValidSources
      ? `Generate a focused, structured summary of the provided academic content. The summary should:
- Start with a clear, descriptive title
- Organize content into 5-10 main sections
- Each section should have an optional heading, required paragraph content, and optional bullet points
- Include technical detail, facts, and examples from the context
- End with a short conclusion if appropriate
STRICTNESS: Only use the provided context. Do not invent facts.`
      : `Generate a focused, structured summary${courseInfo?.courseName ? ` for students in ${courseInfo.courseName}` : ''}. ${courseInfo?.courseDescription ? `Course context: ${courseInfo.courseDescription}. ` : ''}The summary should:
- Start with a clear, descriptive title
- Organize content into 5-10 main sections
- Each section should have an optional heading, required paragraph content, and optional bullet points
- Include technical detail, facts, and examples from general academic knowledge
- End with a short conclusion if appropriate`

    const systemMessage: ModelMessage = { role: 'system', content: SystemPrompt }
    const userMessage: ModelMessage = { role: 'user', content: UserPrompt }

    // Combine messages - only include assistant message if source is selected
    const fullMessages = hasValidSources
      ? [
          systemMessage,
          { role: 'assistant', content: topChunkContent } as ModelMessage,
          userMessage,
        ]
      : [systemMessage, userMessage]

    const startFinalSummarizeTime = Date.now()

    // Generate summary using robust schema - works across all models
    const result = await generateObject({
      model: provider(selectedModel),
      schema: summaryResponseSchema,
      messages: fullMessages,
      temperature: TEMPERATURE,
      maxOutputTokens: TOKEN_RESPONSE_BUDGET,
      providerOptions: {
        openaiCompatible: {
          numCtx: TOKEN_RESPONSE_BUDGET,
        },
      },
    })

    const summaryObj = result.object as SummaryResponse
    const finalUsage = result.usage
    const endFinalSummarizeTime = Date.now()
    const finalTimeTakenMs = endFinalSummarizeTime - startFinalSummarizeTime
    const finalTimeTakenSeconds = finalTimeTakenMs / 1000
    const finalTotalTokens =
      typeof finalUsage?.totalTokens === 'number'
        ? finalUsage.totalTokens
        : Number(finalUsage?.inputTokens ?? 0) + Number(finalUsage?.outputTokens ?? 0)

    const finalTokenGenerationSpeed =
      finalTimeTakenSeconds > 0 ? finalTotalTokens / finalTimeTakenSeconds : 0

    console.log(
      `Progress: 100.00 % | ` +
        `Tokens: prompt(${finalUsage?.inputTokens ?? 0}) completion(${finalUsage?.outputTokens ?? 0}) | ` +
        `${finalTokenGenerationSpeed.toFixed(2)} t/s | ` +
        `Duration: ${finalTimeTakenSeconds.toFixed(2)} s`,
    )

    console.log('DEBUG: LLM summary JSON object:', summaryObj)

    // Normalize summary response to content blocks for citation processing
    function normalizeToBlocks(summary: SummaryResponse): ContentBlock[] {
      const blocks: ContentBlock[] = []

      // Add title as level-1 heading
      if (summary.title) {
        blocks.push({ type: 'heading', level: 1, content: summary.title })
      }

      // Convert each section to blocks
      summary.sections.forEach((section) => {
        // Add heading if present
        if (section.heading) {
          blocks.push({ type: 'heading', level: 2, content: section.heading })
        }

        // Add content paragraph
        if (section.content) {
          blocks.push({ type: 'paragraph', content: section.content })
        }

        // Add bullet points as list if present
        if (section.bullet_points && section.bullet_points.length > 0) {
          blocks.push({
            type: 'list',
            ordered: section.is_ordered_list || false,
            items: section.bullet_points,
            content: '',
          })
        }
      })

      // Add conclusion if present
      if (summary.conclusion) {
        blocks.push({ type: 'heading', level: 2, content: conclusionHeadingLabel })
        blocks.push({ type: 'paragraph', content: summary.conclusion })
      }

      return blocks
    }

    const blocks = normalizeToBlocks(summaryObj)

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

    // Helper: extract text from any value (for list items)
    function extractText(value: unknown): string {
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      return ''
    }

    // Prepare citation blocks (split paragraphs/lists into sentences) - only if source is selected
    type CitationBlock = { type: string; content: string; blockIdx: number; itemIdx?: number }
    const citationBlocks: CitationBlock[] = []

    if (hasValidSources) {
      blocks.forEach((block, idx) => {
        if (block.type === 'paragraph') {
          const sentences = splitIntoSentences(block.content || '')
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
        const paraSentences = splitIntoSentences(block.content || '')
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
      (b) => b.type === 'heading' && isConclusionHeadingText(b.content),
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
      // 3. If no level 2 headings, insert localized 'Overview' before first paragraph (if present)
      if (!hasLevel2) {
        if (blocks[idx] && blocks[idx].type === 'paragraph') {
          out.push({ type: 'heading', content: overviewHeadingLabel, level: 2 })
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
      // 5. Remove all but the last localized 'Conclusion' heading and its following paragraph
      let lastConclusionIdx = -1
      for (let i = 0; i < out.length; i++) {
        if (out[i].type === 'heading' && isConclusionHeadingText(out[i].content)) {
          lastConclusionIdx = i
        }
      }
      if (lastConclusionIdx !== -1) {
        // Remove all previous 'Conclusion' headings and their following paragraph (if any)
        const filtered: Block[] = []
        for (let i = 0; i < out.length; ) {
          if (
            out[i].type === 'heading' &&
            isConclusionHeadingText(out[i].content) &&
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
            isConclusionHeadingText(b.content) &&
            arr.findIndex((x) => x.type === 'heading' && isConclusionHeadingText(x.content)) !== i
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
