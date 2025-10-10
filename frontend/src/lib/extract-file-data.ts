// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import path from 'path'

export type FileType = 'pdf' | 'txt' | 'md' | 'mp3' | 'wav'

export interface location {
  page: number
  bbox: number[]
  text: string
}

export interface ExtractedData {
  type: FileType
  text: string[]
  images: { filename: string; embedding: number[]; order: number; image_bytes: string }[]
}

/**
 * Extracts file type and text content from a given file.
 *
 * This function determines the file type based on its extension and MIME type,
 * and extracts text content using appropriate methods for each file type.
 *
 * @param file - An object containing the file's name, data, and MIME type.
 * @returns A promise that resolves to an object containing the extracted text and file type.
 * @throws An error if the file type is unsupported.
 */
export async function extractFileData(file: {
  name: string
  data: Buffer
  mimetype: string
}): Promise<ExtractedData> {
  const ext = path.extname(file.name).toLowerCase()
  const { mimetype, data } = file
  let fileType: FileType
  let extractedText: string[] = []
  let extractedImages: {
    filename: string
    embedding: number[]
    order: number
    image_bytes: string
  }[] = []

  if (mimetype.includes('pdf') || ext === '.pdf') {
    fileType = 'pdf'

    const formData = new FormData()
    formData.append('file', new Blob([new Uint8Array(data)], { type: mimetype }), file.name)

    // Upload file and get response to confirm upload status

    const url = new URL('/upload', process.env.FASTAPI_SERVER_URL)
    const uploadResponse = await fetch(url, {
      method: 'POST',
      body: formData,
    })
    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file to FastAPI server')
    }

    const { jobID } = await uploadResponse.json()

    // Poll /result/{jobID} until done with timeout and retry handling
    const pollResult = async (retryCount: number = 0): Promise<ExtractedData> => {
      const url = new URL(`/result/${encodeURIComponent(jobID)}`, process.env.FASTAPI_SERVER_URL)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s per poll request

      try {
        const pollRes = await fetch(url, { signal: controller.signal })
        clearTimeout(timeoutId)

        if (pollRes.status === 202) {
          // Not ready yet, wait and retry
          await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 3000)
          })
          return pollResult(0) // Reset retry count on successful poll
        }
        if (!pollRes.ok) {
          throw new Error('Failed to retrieve processed PDF result')
        }
        return pollRes.json()
      } catch (error: unknown) {
        clearTimeout(timeoutId)
        const err = error as Error & { code?: string; cause?: { code?: string }; name?: string }

        // Handle both ECONNRESET and AbortError (timeout)
        const shouldRetry =
          err.code === 'ECONNRESET' ||
          err.cause?.code === 'ECONNRESET' ||
          err.name === 'AbortError' ||
          err.message.includes('ECONNRESET')

        if (shouldRetry && retryCount < 3) {
          const delay = 1000 * (retryCount + 1) // 1s, 2s, 3s
          console.log(`Connection issue, retrying in ${delay}ms... (${retryCount + 1}/3)`)
          await new Promise<void>((resolve) => setTimeout(() => resolve(), delay))
          return pollResult(retryCount + 1)
        }

        throw error
      }
    }

    const parsedData = await pollResult()
    extractedText = parsedData.text
    extractedImages = parsedData.images
  } else if (mimetype.includes('text') || ext === '.txt') {
    fileType = 'txt'

    // contentSequence.push({ type: 'text', content: data.toString('utf-8') });
  } else if (mimetype.includes('markdown') || ext === '.md') {
    fileType = 'md'
    // contentSequence.push({ type: 'text', content: data.toString('utf-8') });
  } else {
    throw new Error('Unsupported file type')
  }

  return { text: extractedText, type: fileType, images: extractedImages }
}
