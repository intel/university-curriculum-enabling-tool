import { NextRequest, NextResponse } from 'next/server'

// app/api/model/route.ts
export async function POST(req: Request) {
  const { name } = await req.json()

  const ollamaUrl = process.env.OLLAMA_URL

  const ollamaPullUrl = new URL('/api/pull', ollamaUrl).href
  const response = await fetch(ollamaPullUrl, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

  if (!response.ok) {
    throw new Error('Failed to pull model')
  }

  const contentLength = response.headers.get('content-length')
  const totalBytes = contentLength ? parseInt(contentLength, 10) : null

  const stream = createProgressStream(response.body, totalBytes)

  const headers = new Headers(response.headers)
  headers.set('Content-Type', 'application/json')
  return new Response(stream, { headers })
}

function createProgressStream(
  body: ReadableStream<Uint8Array> | null,
  totalBytes: number | null,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const reader = body?.getReader()
      if (!reader) {
        controller.close()
        return
      }

      let receivedBytes = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          const progressMessage = JSON.stringify({ progress: 100 })
          controller.enqueue(new TextEncoder().encode(progressMessage + '\n'))
          controller.close()
          return
        }

        receivedBytes += value.length
        const progress = totalBytes ? (receivedBytes / totalBytes) * 100 : null

        const progressMessage = JSON.stringify({ progress })
        controller.enqueue(new TextEncoder().encode(progressMessage + '\n'))

        controller.enqueue(value)
      }
    },
  })
}

// Delete model API
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { model } = body

    if (!model) {
      return NextResponse.json({ error: 'Model name is required' }, { status: 400 })
    }

    const OLLAMA_URL = process.env.OLLAMA_URL
    const ollamaDeleteUrl = new URL('/api/delete', OLLAMA_URL).href
    const ollamaResponse = await fetch(ollamaDeleteUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model }),
    })

    console.log('OLLAMA response:', ollamaResponse)

    if (!ollamaResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to delete model', details: ollamaResponse.statusText },
        { status: ollamaResponse.status },
      )
    }

    console.log('Model deleted successfully:', ollamaResponse.statusText)
    console.log('Returning response:', ollamaResponse.statusText)
    return NextResponse.json(ollamaResponse.statusText, { status: 200 })
  } catch (error) {
    console.error('Error deleting model:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Internal Server Error', details: errorMessage },
      { status: 500 },
    )
  }
}
