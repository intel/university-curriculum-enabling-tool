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

    // Poll /result/{jobID} until done
    const pollResult = async (): Promise<ExtractedData> => {
      const url = new URL(`/result/${encodeURIComponent(jobID)}`, process.env.FASTAPI_SERVER_URL)
      const pollRes = await fetch(url)
      if (pollRes.status === 202) {
        // Not ready yet, wait and retry
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 3000)
        })
        return pollResult()
      }
      if (!pollRes.ok) {
        throw new Error('Failed to retrieve processed PDF result')
      }
      return pollRes.json()
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
