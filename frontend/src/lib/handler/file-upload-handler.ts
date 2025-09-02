// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { extractFileData, FileType } from '@/lib/extract-file-data'
import { generateEmbeddings } from '@/lib/embedding/generate-embedding'
import sharp from 'sharp'
import type { PayloadRequest } from 'payload'

// Only formats supported by sharp
const validFormats = ['jpeg', 'png', 'webp', 'gif', 'tiff', 'svg', 'avif', 'bmp', 'heif']

// Interface for file object
interface FileObject {
  name: string
  data: Buffer
  mimetype: string
  size: number
}

// Interface for function response
interface FileUploadResponse {
  message: boolean
  id: number
}

// Interface for image objects
interface ImageObject {
  filename: string
  embedding: number[]
  order: number
  image_bytes: string
}

/**
 * Handles the file upload process, including extracting file data,
 * transcribing audio if necessary, and storing the file and its embeddings.
 *
 * @param req - The request object containing formData with the uploaded file.
 * @returns A promise resolving to an object with a success message and the source ID.
 * @throws Will throw an error if formData is undefined or no file is uploaded.
 */
export async function fileUploadHandler(req: PayloadRequest): Promise<FileUploadResponse> {
  if (!req.formData) {
    throw new Error('formData is undefined')
  }
  const formData = await req.formData()
  const fileBlob = formData.get('file') as File

  if (!fileBlob) {
    throw new Error('No file uploaded')
  }

  const arrayBuffer = await fileBlob.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const file = {
    name: fileBlob.name,
    data: buffer,
    mimetype: fileBlob.type || `application/octet-stream`,
    size: buffer.length,
  }

  const { text, type, images } = await extractFileData(file)

  // Join text array into a single string for embeddings and storage
  const joinedText = Array.isArray(text) ? text.join('\n') : text

  console.log(`DEBUG fileUploadHandler: Storing file and embedding`)
  if (type === 'mp3' || type === 'wav') {
    const transcript = await transcribeAudio(file)
    return await storeFileAndEmbeddings(req, file, type, transcript)
  } else {
    return await storeFileAndEmbeddings(req, file, type, joinedText, images)
  }
}

/**
 * Transcribes audio files to text using an external transcription service.
 *
 * @param file - The audio file to be transcribed.
 * @returns A promise resolving to the transcribed text.
 * @throws Will throw an error if the transcription service fails.
 */
async function transcribeAudio(file: FileObject): Promise<string> {
  const formData = new FormData()
  formData.append('file', new Blob([new Uint8Array(file.data)]), file.name)
  formData.append('language', 'english')

  const response = await fetch('http://localhost/v1/audio/transcription', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Failed to transcribe audio')
  }

  const data = await response.json()
  return data.transcript
}

/**
 * Stores the file and its embeddings in the database.
 *
 * @param req - The request object used for database operations.
 * @param file - The file object containing file data and metadata.
 * @param type - The type of the file (e.g., text, audio).
 * @param text - The text content extracted or transcribed from the file.
 * @param images - The images extracted from the file (if applicable).
 * @returns A promise resolving to an object with a success message and the source ID.
 */
async function storeFileAndEmbeddings(
  req: PayloadRequest,
  file: FileObject,
  type: FileType,
  text: string,
  images?: ImageObject[],
): Promise<FileUploadResponse> {
  const source = await req.payload.create({
    collection: 'sources',
    data: {
      name: file.name,
      content: text,
      type: type,
      metadata: { size: file.size },
    },
    file: {
      name: file.name,
      data: file.data,
      mimetype: file.mimetype,
      size: file.size,
    },
  })

  const chunkSizeToken = parseInt(process.env.RAG_EMBEDDING_CHUNK_SIZE_TOKEN || '200')
  const chunkOverlapToken = parseInt(process.env.RAG_EMBEDDING_CHUNK_OVERLAP_TOKEN || '50')

  const embeddingResults = await generateEmbeddings(text, chunkSizeToken, chunkOverlapToken)

  if (embeddingResults.length === 0) {
    throw new Error('No valid embeddings generated.')
  }

  for (const { chunk, embedding, order } of embeddingResults) {
    const chunkCollection = await req.payload.create({
      collection: 'chunks',
      data: {
        source: source.id,
        chunk,
        order,
      },
    })

    await req.payload.create({
      collection: 'embeddings',
      data: {
        source: source.id,
        chunk: chunkCollection.id,
        embedding,
        embeddingType: 'text',
      },
    })
  }

  console.log(`Stored ${embeddingResults.length} embeddings.`)
  for (const image of images ?? []) {
    const { filename, embedding, order, image_bytes: imageBytes } = image

    // Decode the image_bytes from hex to binary
    const imageBuffer: Buffer = Buffer.from(imageBytes, 'hex')

    // Get extension from filename
    const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/i)
    const ext = extMatch ? extMatch[1].toLowerCase() : ''
    if (!ext) {
      console.warn(`No file extension found for file: ${filename}`)
      continue
    }

    // Check for unsupported extensions like .jpx
    if (!validFormats.includes(ext)) {
      console.warn(`Skipping unsupported image format by extension: ${ext} (${filename})`)
      continue
    }

    const imageFile = sharp(imageBuffer)
    const metadata = await imageFile.metadata()

    let format: string
    const formatFromMetadata =
      typeof metadata.format === 'string' ? metadata.format.toLowerCase() : ''
    if (formatFromMetadata && validFormats.includes(formatFromMetadata)) {
      format = formatFromMetadata
    } else {
      // fallback to jpeg if metadata format is missing but extension is valid
      format = 'jpeg'
      console.warn(`Metadata format missing or invalid for ${filename}, falling back to 'jpeg'`)
    }

    // Convert Sharp metadata to a plain JSON-serializable object
    const jsonMetadata: Record<string, unknown> = {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      space: metadata.space,
      channels: metadata.channels,
      depth: metadata.depth,
      density: metadata.density,
      hasProfile: metadata.hasProfile,
      hasAlpha: metadata.hasAlpha,
      isProgressive: metadata.isProgressive,
      ...(metadata.size && { size: metadata.size }),
      ...(metadata.pages && { pages: metadata.pages }),
      ...(metadata.pageHeight && { pageHeight: metadata.pageHeight }),
      ...(metadata.loop !== undefined && { loop: metadata.loop }),
      ...(metadata.orientation && { orientation: metadata.orientation }),
      ...(metadata.chromaSubsampling && { chromaSubsampling: metadata.chromaSubsampling }),
      ...(metadata.compression && { compression: metadata.compression }),
      ...(metadata.resolutionUnit && { resolutionUnit: metadata.resolutionUnit }),
    }

    try {
      const mediaCollection = await req.payload.create({
        collection: 'media',
        data: {
          source: source.id,
          filename,
          metadata: jsonMetadata,
          order,
        },
        file: {
          name: filename,
          data: imageBuffer,
          mimetype: `image/${format}`,
          size: imageBuffer.length,
        },
      })

      await req.payload.create({
        collection: 'embeddings',
        data: {
          source: source.id,
          media: mediaCollection.id,
          embedding,
          embeddingType: 'image',
        },
      })
      console.log(`Uploaded image to media collection: ${filename}`)
    } catch (err) {
      console.error(`Failed to upload image: ${filename}`, err)
    }
  }

  return { message: true, id: source.id }
}
