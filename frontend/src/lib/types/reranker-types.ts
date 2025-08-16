export interface ScoreChunkPairOptions {
  query: string
  passage: string
  id?: string
}

export interface ScoreChunkPairResult {
  id?: string
  score: number
}
