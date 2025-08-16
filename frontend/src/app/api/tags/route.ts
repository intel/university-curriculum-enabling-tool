export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const OLLAMA_URL = process.env.OLLAMA_URL
  const ollamaTagsUrl = new URL('/api/tags', OLLAMA_URL).href
  const res = await fetch(ollamaTagsUrl)
  return new Response(res.body, res)
}
