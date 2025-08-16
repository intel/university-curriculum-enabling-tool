import { cosineSimilarity } from 'ai'
import { ClientSource } from '../types/client-source'
import { ContextChunk, ScoredChunk } from '../types/context-chunk'
import { getStoredChunks } from './get-stored-chunks'
import { getStoredEmbeddings } from '../embedding/get-stored-embeddings'
import { getUserEmbedding } from '../embedding/get-user-embedding'
import { rerankWithOllama } from '../reranking/rerank-chunks'

// Interface for embedding chunks
interface EmbeddingChunk {
  chunk?: string
  embedding: number[]
  order?: number
  sourceId?: number
}

// Configuration
const CONFIG = {
  // BM25 parameters (can be tuned)
  BM25: {
    k1: 1.2, // Term frequency saturation parameter
    b: 0.75, // Document length normalization parameter
  },
  // Debug settings
  DEBUG: process.env.DEBUG_LOGS || true, // Set to false in production
}

// Logger utilities
const logger = {
  log: (message: string, data?: unknown) => {
    if (CONFIG.DEBUG) {
      if (data) console.log(`DEBUG: ${message}`, data)
      else console.log(`DEBUG: ${message}`)
    }
  },
  error: (message: string, data?: unknown) => {
    if (CONFIG.DEBUG) {
      if (data) console.error(`DEBUG: ${message}`, data)
      else console.error(`DEBUG: ${message}`)
    }
  },
  table: (message: string, headers: string[], rows: string[][]) => {
    if (!CONFIG.DEBUG) return
    console.log(`DEBUG: ${message}`)
    console.log(`| ${headers.join(' | ')} |`)
    console.log(`| ${headers.map((header) => '-'.repeat(header.length)).join(' | ')} |`)
    rows.forEach((row) => {
      console.log(`| ${row.join(' | ')} |`)
    })
  },
  time: (label: string) => {
    if (CONFIG.DEBUG) console.time(`DEBUG: ${label}`)
  },
  timeEnd: (label: string) => {
    if (CONFIG.DEBUG) console.timeEnd(`DEBUG: ${label}`)
  },
}

/**
 * Validates search parameters
 */
function validateParameters(semanticWeight: number, keywordWeight: number): void {
  if (semanticWeight + keywordWeight !== 1.0) {
    logger.error(
      `Invalid weights - semanticWeight: ${semanticWeight}, keywordWeight: ${keywordWeight}`,
    )
    throw new Error('Semantic and keyword weights must sum to 1.0')
  }
}

/**
 * Prepares document chunks with original indices
 */
async function prepareDocuments(selectedSources: ClientSource[]) {
  logger.log(`Fetching document chunks from ${selectedSources.length} sources`)
  const documentChunks = await getStoredChunks(selectedSources)
  logger.log(`Retrieved ${documentChunks.length} document chunks`)

  // Add original index to each chunk for tracing
  const indexedChunks = documentChunks.map((chunk, index) => ({
    ...chunk,
    originalIndex: index, // Store original position
  }))

  return { documentChunks, indexedChunks }
}

/**
 * Fetches and prepares embeddings
 */
async function prepareEmbeddings(selectedSources: ClientSource[], query: string) {
  const embeddingChunks = await getStoredEmbeddings(selectedSources)
  const userEmbeddingResult = await getUserEmbedding(query)
  const userEmbedding = userEmbeddingResult[0].embedding

  return { embeddingChunks, userEmbedding }
}

/**
 * Extracts search terms from query
 */
function extractSearchTerms(query: string): string[] {
  const searchTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter((term) => term.length > 2) // Only consider terms with length > 2

  logger.log(`Extracted search terms: [${searchTerms.join(', ')}]`)
  return searchTerms
}

/**
 * Calculates document statistics for BM25
 */
function calculateDocumentStatistics(documentChunks: ContextChunk[], searchTerms: string[]) {
  logger.log(`Calculating document frequencies for ${searchTerms.length} terms`)

  // Calculate document frequencies for each term
  const docFrequencies: { [term: string]: number } = {}
  for (const term of searchTerms) {
    docFrequencies[term] = documentChunks.filter((chunk) =>
      chunk.chunk.toLowerCase().includes(term.toLowerCase()),
    ).length
  }

  // Calculate average document length
  const totalDocs = documentChunks.length
  const totalDocLength = documentChunks.reduce((sum, chunk) => sum + chunk.chunk.length, 0)
  const avgDocLength = totalDocLength / totalDocs

  logger.log(`Average document length: ${avgDocLength.toFixed(2)} characters`)
  logger.log(`Document frequencies:`, docFrequencies)

  return { docFrequencies, avgDocLength, totalDocs }
}

/**
 * Calculates BM25 score for a document
 */
function calculateBM25Score(
  chunk: string,
  searchTerms: string[],
  docFrequencies: Record<string, number>,
  totalDocs: number,
  avgDocLength: number,
): number {
  let bm25Score = 0
  const { k1, b } = CONFIG.BM25
  const docLength = chunk.length

  for (const term of searchTerms) {
    // Count term frequency in document
    const termMatches = chunk.toLowerCase().match(new RegExp(term.toLowerCase(), 'g')) || []
    const termFreq = termMatches.length

    if (termFreq > 0) {
      // Apply BM25 formula
      const df = docFrequencies[term]
      const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1)
      const termScore =
        idf * ((termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (docLength / avgDocLength))))
      bm25Score += termScore
    }
  }

  return bm25Score
}

/**
 * Calculates hybrid scores combining BM25 and semantic similarity
 */
function calculateHybridScores(
  indexedChunks: (ContextChunk & { originalIndex: number })[],
  embeddingChunks: EmbeddingChunk[],
  userEmbedding: number[],
  searchTerms: string[],
  docStats: {
    docFrequencies: Record<string, number>
    avgDocLength: number
    totalDocs: number
  },
  semanticWeight: number,
  keywordWeight: number,
): ScoredChunk[] {
  logger.log(`Calculating BM25 and semantic scores for ${indexedChunks.length} chunks`)

  const { docFrequencies, avgDocLength, totalDocs } = docStats

  // Calculate raw scores
  const scoredChunks: ScoredChunk[] = indexedChunks.map((chunk) => {
    // Calculate BM25 score
    const bm25Score = calculateBM25Score(
      chunk.chunk,
      searchTerms,
      docFrequencies,
      totalDocs,
      avgDocLength,
    )

    // Find matching embedding for semantic score
    const matchingEmbedding = embeddingChunks.find(
      (e) => e.chunk === chunk.chunk || e.order === chunk.order,
    )

    const semanticScore = matchingEmbedding
      ? cosineSimilarity(userEmbedding, matchingEmbedding.embedding)
      : 0

    return {
      ...chunk,
      bm25Score,
      semanticScore,
      combinedScore: 0, // Will be calculated after normalization
    }
  })

  // Normalize and combine scores
  return normalizeScores(scoredChunks, semanticWeight, keywordWeight)
}

/**
 * Normalizes and combines scores
 */
function normalizeScores(
  scoredChunks: ScoredChunk[],
  semanticWeight: number,
  keywordWeight: number,
): ScoredChunk[] {
  // Find max values for normalization
  const maxBm25 = Math.max(...scoredChunks.map((c) => c.bm25Score), 0.001)
  const maxSemantic = Math.max(...scoredChunks.map((c) => c.semanticScore), 0.001)

  logger.log(`Max scores - BM25: ${maxBm25.toFixed(4)}, Semantic: ${maxSemantic.toFixed(4)}`)

  // Normalize and combine scores
  scoredChunks.forEach((chunk) => {
    const normalizedBm25 = chunk.bm25Score / maxBm25
    const normalizedSemantic = chunk.semanticScore / maxSemantic

    chunk.combinedScore = keywordWeight * normalizedBm25 + semanticWeight * normalizedSemantic
  })

  return scoredChunks
}

/**
 * Sorts chunks by combined score
 */
function sortByScore(scoredChunks: ScoredChunk[]): ScoredChunk[] {
  logger.log(`Sorting ${scoredChunks.length} chunks by combined score`)
  return [...scoredChunks].sort((a, b) => b.combinedScore - a.combinedScore)
}

/**
 * Logs ranking results in a readable table
 */
function logRankingResults(sortedChunks: ScoredChunk[], limit: number = 10): void {
  const rows = sortedChunks
    .slice(0, limit)
    .map((chunk, i) => [
      (i + 1).toString().padEnd(4),
      `chunk #${chunk.originalIndex + 1}`.padEnd(14),
      chunk.combinedScore.toFixed(5).padEnd(14),
      `"${chunk.chunk.substring(0, 30).replace(/\n/g, ' ')}..."`,
    ])

  logger.table(
    'Chunk ordering before & after hybrid sort (first 10 chunks):',
    ['Rank', 'Original Index', 'Combined Score', 'Chunk Preview'],
    rows,
  )
}

/**
 * Performs reranking of top candidates
 */
async function performReranking(query: string, candidates: ScoredChunk[]): Promise<ScoredChunk[]> {
  logger.log(
    `Sending ${candidates.length} chunks for reranking with model: ${process.env.RAG_RERANKING_MODEL || 'default'}`,
  )

  logger.time('Reranking time')
  const rerankedChunks = await rerankWithOllama(query, candidates)
  logger.timeEnd('Reranking time')

  logger.log(`Reranking complete, received ${rerankedChunks.length} reranked chunks`)

  // Check if rerank scores were properly assigned
  const chunksWithRerankScore = rerankedChunks.filter((c) => c.rerankScore !== undefined).length

  logger.log(`Chunks with valid rerank scores: ${chunksWithRerankScore}/${rerankedChunks.length}`)

  // Normalize rerank scores
  normalizeRerankScores(rerankedChunks)

  return rerankedChunks
}

/**
 * Normalizes reranking scores to 0-1 range
 */
function normalizeRerankScores(rerankedChunks: ScoredChunk[]): void {
  const maxRerankScore = Math.max(...rerankedChunks.map((c) => c.rerankScore || 0), 1)

  logger.log(`Max rerank score before normalization: ${maxRerankScore.toFixed(4)}`)

  rerankedChunks.forEach((chunk) => {
    chunk.rerankScore = (chunk.rerankScore || 0) / maxRerankScore
  })
}

/**
 * Logs reranking comparison results
 */
function logRerankingResults(rerankedChunks: ScoredChunk[], sortedChunks: ScoredChunk[]): void {
  // Log first few reranked results
  logger.log('First 5 chunks after reranking:')
  rerankedChunks.slice(0, 5).forEach((c, i) => {
    logger.log(
      `Rank ${i + 1} - Combined: ${c.combinedScore.toFixed(4)}, ` +
        `Rerank: ${c.rerankScore?.toFixed(4) || 'N/A'}, ` +
        `Chunk: "${c.chunk.substring(0, 50)}..."`,
    )
  })

  // Compare original ranking with reranked results
  logger.log('Ranking comparison (first 5 results):')
  for (let i = 0; i < 5 && i < rerankedChunks.length; i++) {
    const originalRank = sortedChunks.findIndex((sc) => sc.chunk === rerankedChunks[i].chunk) + 1
    logger.log(`Reranked #${i + 1} was originally ranked #${originalRank}`)
  }

  // Create a detailed comparison table
  const rows = rerankedChunks.slice(0, 10).map((chunk, i) => {
    const hybridRank = sortedChunks.findIndex((sc) => sc.originalIndex === chunk.originalIndex) + 1
    return [
      (i + 1).toString().padEnd(4),
      `chunk #${chunk.originalIndex + 1}`.padEnd(14),
      hybridRank.toString().padEnd(11),
      (chunk.rerankScore || 0).toFixed(4).padEnd(12),
      `"${chunk.chunk.substring(0, 25).replace(/\n/g, ' ')}..."`,
    ]
  })

  logger.table(
    'Chunk ordering changes after reranking (top 10):',
    ['Rank', 'Original Index', 'Hybrid Rank', 'Rerank Score', 'Chunk Preview'],
    rows,
  )

  // Distribution analysis
  const originalIndicesInTop100 = sortedChunks.slice(0, 100).map((c) => c.originalIndex)
  const minIndex = Math.min(...originalIndicesInTop100)
  const maxIndex = Math.max(...originalIndicesInTop100)
  logger.log(`Original indices in top 100: range ${minIndex}-${maxIndex}`)

  // Compare top chunks before and after reranking
  logger.log('Top 5 chunks comparison - Hybrid vs Reranked:')
  for (let i = 0; i < 5; i++) {
    if (i < sortedChunks.length && i < rerankedChunks.length) {
      const hybridChunk = sortedChunks[i]
      const rerankedChunk = rerankedChunks[i]
      const isSame = hybridChunk.originalIndex === rerankedChunk.originalIndex ? 'SAME' : 'CHANGED'
      logger.log(
        `Rank #${i + 1}: ${isSame} | Hybrid: chunks #${hybridChunk.originalIndex + 1} | Reranked: chunks #${rerankedChunk.originalIndex + 1}`,
      )
    }
  }
}

/**
 * Prepares final results in the expected format
 */
function prepareFinalResults(chunks: ScoredChunk[], topK: number): ContextChunk[] {
  return chunks.slice(0, topK).map((chunk) => ({
    ...chunk,
    similarity: chunk.rerankScore !== undefined ? chunk.rerankScore : chunk.combinedScore,
  }))
}

/**
 * Main hybrid search function - orchestrates the search process
 */
export async function hybridSearch(
  query: string,
  selectedSources: ClientSource[],
  semanticWeight: number = 0.7,
  keywordWeight: number = 0.3,
  topK: number = 5,
  useReranker: boolean = false,
  rerankCandidates: number = 15, // How many candidates to rerank
): Promise<ContextChunk[]> {
  logger.log(`Starting hybrid search with query: "${query}"`)
  logger.log(
    `Parameters - semanticWeight: ${semanticWeight}, keywordWeight: ${keywordWeight}, topK: ${topK}, useReranker: ${useReranker}`,
  )

  // 1. Validate parameters
  validateParameters(semanticWeight, keywordWeight)

  // 2. Prepare data
  const { documentChunks, indexedChunks } = await prepareDocuments(selectedSources)
  const { embeddingChunks, userEmbedding } = await prepareEmbeddings(selectedSources, query)

  // 3. Process search terms
  const searchTerms = extractSearchTerms(query)
  const docStats = calculateDocumentStatistics(documentChunks, searchTerms)

  // 4. Score documents
  const scoredChunks = calculateHybridScores(
    indexedChunks,
    embeddingChunks,
    userEmbedding,
    searchTerms,
    docStats,
    semanticWeight,
    keywordWeight,
  )

  // 5. Sort and log results
  const sortedChunks = sortByScore(scoredChunks)
  logRankingResults(sortedChunks)

  // 6. Return results if reranking is disabled
  if (!useReranker) {
    logger.log(`Reranking disabled, returning top ${topK} results based on combined score`)
    return prepareFinalResults(sortedChunks, topK)
  }

  // 7. Perform reranking
  const rerankerCandidates = sortedChunks.slice(0, rerankCandidates)
  const rerankedChunks = await performReranking(query, rerankerCandidates)

  // 8. Log reranking results
  logRerankingResults(rerankedChunks, sortedChunks)

  // 9. Return final results
  logger.log(`Returning top ${topK} results after reranking`)
  return prepareFinalResults(rerankedChunks, topK)
}
