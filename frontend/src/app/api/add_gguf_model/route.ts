// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server'
import { getLLMUrl } from '@/lib/getLLMUrl'
import { safeFetch } from '@/lib/ssrf-guard'
import path from 'path'
import fs from 'fs/promises'

const localFilePath = path.resolve(process.cwd(), '..', 'models')

const VALID_FILENAME_REGEX = /^[a-zA-Z0-9_\-]+\.gguf$/

function validateFileName(fileName: unknown): { valid: boolean; error?: string } {

  if (!fileName) {
    return { valid: false, error: 'fileName is required' }
  }

  if (typeof fileName !== 'string') {
    return { valid: false, error: 'fileName must be a string' }
  }

  if (fileName.trim() === '') {
    return { valid: false, error: 'fileName cannot be empty' }
  }

  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return { valid: false, error: 'fileName contains invalid characters' }
  }

  if (!VALID_FILENAME_REGEX.test(fileName)) {
    return {
      valid: false,
      error: 'fileName must contain only alphanumeric characters, hyphens, underscores and end with .gguf',
    }
  }

  return { valid: true }
}

function sanitizeFileName(fileName: string): string {
  return path.basename(fileName)
}

function isPathWithinBoundary(filePath: string, basePath: string): boolean {
  const resolvedFilePath = path.resolve(filePath)
  const resolvedBasePath = path.resolve(basePath)
  return resolvedFilePath.startsWith(resolvedBasePath + path.sep)
}

export async function GET() {
  try {
    const PROVIDER_URL = await getLLMUrl()
    const urlOllamaTags = new URL('/api/tags', PROVIDER_URL).href
    const tagsResponse = await safeFetch(urlOllamaTags)

    if (!tagsResponse.ok) {
      throw new Error('Failed to fetch existing models from Ollama')
    }

    const tagsData = await tagsResponse.json()

    const existingModels = Array.isArray(tagsData)
      ? tagsData.map((tag: { name: string }) => tag.name.replace(':latest', ''))
      : tagsData.models?.map((tag: { name: string }) => tag.name.replace(':latest', '')) || []

    const files = await fs.readdir(localFilePath)
    console.log('Files in models directory:', localFilePath)

    const fileDetails = []
    for (const file of files) {
      const filePath = path.join(localFilePath, file)
      const stat = await fs.stat(filePath)
      if (stat.isFile() && file.endsWith('.gguf')) {
        if (!existingModels.includes(file)) {
          fileDetails.push({
            fileName: file,
            fileSize: stat.size,
          })
        }
      }
    }

    return NextResponse.json({ files: fileDetails }, { status: 200 })
  } catch (error) {
    console.error('Error reading models directory or fetching tags:', error)
    return NextResponse.json(
      {
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const models = body.models

    if (!Array.isArray(models)) {
      return NextResponse.json(
        { error: 'Invalid request format. Expected an array of models.' },
        { status: 400 },
      )
    }

    if (models.length === 0) {
      return NextResponse.json(
        { error: 'Models array cannot be empty.' },
        { status: 400 },
      )
    }

    const MAX_MODELS_PER_REQUEST = 10
    if (models.length > MAX_MODELS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many models in request. Maximum allowed is ${MAX_MODELS_PER_REQUEST}.` },
        { status: 400 },
      )
    }

    const results = []

    for (const model of models) {
      console.log(`Processing ${model.fileName}\n.................`)

      const validation = validateFileName(model.fileName)
      if (!validation.valid) {
        console.warn(`Invalid fileName rejected: ${model.fileName} - ${validation.error}`)
        results.push({
          fileName: model.fileName,
          status: 'error',
          message: `Invalid fileName: ${validation.error}`,
        })
        continue
      }

      const safeFileName = sanitizeFileName(model.fileName)

      const modelNameWithoutExtension = safeFileName.replace('.gguf', '')

      const modelfilePath = path.join(localFilePath, `Modelfile-${modelNameWithoutExtension}`)

      if (!isPathWithinBoundary(modelfilePath, localFilePath)) {
        console.warn(`Path traversal attempt detected for fileName: ${model.fileName}`)
        results.push({
          fileName: model.fileName,
          status: 'error',
          message: 'Invalid file path detected',
        })
        continue
      }

      const modelfileTemplate = `FROM ./${safeFileName}\n\nTEMPLATE \"\"\"{{ if .System }}<|im_start|>system\n{{ .System }}<|im_end|>\n{{ end }}{{ if .Prompt }}<|im_start|>user\n{{ .Prompt }}<|im_end|>\n{{ end }}<|im_start|>assistant\n\"\"\"\nPARAMETER stop \"<|system|>\"\nPARAMETER stop \"<|user|>\"\nPARAMETER stop \"<|assistant|>\"\nPARAMETER stop \"<|/s>\"`

      try {
        await fs.writeFile(modelfilePath, modelfileTemplate, 'utf8')
        console.log(`Modelfile written to ${modelfilePath}`)

        const apiPayload = {
          model: safeFileName,
          modelfile: modelfileTemplate,
          path: modelfilePath,
        }

        const PROVIDER_URL = await getLLMUrl()
        const apiCreateUrl = new URL('/api/create', PROVIDER_URL).href
        const response = await safeFetch(apiCreateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(apiPayload),
        })

        if (!response.ok) {
          console.error(`Failed to call Ollama API for ${safeFileName}:`, await response.text())
          results.push({
            fileName: safeFileName,
            status: 'error',
            message: `Failed to add GGUF model: ${safeFileName}`,
          })
          continue
        }

        console.log(`SUCCESS: Added model: ${safeFileName} to Ollama`)
        results.push({
          fileName: safeFileName,
          status: 'success',
          message: `Added model: ${safeFileName} to Ollama`,
        })
      } catch (err) {
        console.error(`Failed to process ${safeFileName}:`, err)
        results.push({
          fileName: safeFileName,
          status: 'error',
          message: `Failed to process ${safeFileName}`,
        })
      }
    }

    return NextResponse.json({ results }, { status: 200 })
  } catch (error) {
    console.error('Error processing request:', error)
    return NextResponse.json(
      {
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}