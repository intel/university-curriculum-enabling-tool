import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'

const localFilePath = path.resolve(process.cwd(), '..', 'models')
const OLLAMA_URL = process.env.OLLAMA_URL

export async function GET() {
  try {
    // Fetch the list of existing models from Ollama via /api/tags
    const urlOllamaTags = new URL('/api/tags', OLLAMA_URL).href
    const tagsResponse = await fetch(urlOllamaTags)
    if (!tagsResponse.ok) {
      throw new Error('Failed to fetch existing models from Ollama')
    }

    const tagsData = await tagsResponse.json()

    // Ensure tagsData is an array or extract the array if nested
    const existingModels = Array.isArray(tagsData)
      ? tagsData.map((tag: { name: string }) => tag.name.replace(':latest', '')) // Add .gguf to match full file names
      : tagsData.models?.map((tag: { name: string }) => tag.name.replace(':latest', '')) || []

    // console.log("Cleaned existingModels with .gguf:", existingModels); // Debugging log

    // Read the contents of the models directory
    const files = await fs.readdir(localFilePath)
    console.log('Files in models directory:', localFilePath) // Debugging log

    // Filter out directories and return only .gguf filenames with their sizes
    const fileDetails = []
    for (const file of files) {
      const filePath = path.join(localFilePath, file)
      const stat = await fs.stat(filePath)
      if (stat.isFile() && file.endsWith('.gguf')) {
        if (!existingModels.includes(file)) {
          // Only include models that are not already in Ollama
          fileDetails.push({
            fileName: file,
            fileSize: stat.size, // File size in bytes
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
    // Parse the incoming request body as JSON
    const body = await req.json()

    // Extract the models array from the body
    const models = body.models

    if (!Array.isArray(models)) {
      return NextResponse.json(
        { error: 'Invalid request format. Expected an array of models.' },
        { status: 400 },
      )
    }

    const results = []

    for (const model of models) {
      // Create a Modelfile template
      console.log(`Processing ${model.fileName}\n.................`)
      const modelfileTemplate = `FROM ./${model.fileName}\n\nTEMPLATE \"\"\"{{ if .System }}<|im_start|>system\n{{ .System }}<|im_end|>\n{{ end }}{{ if .Prompt }}<|im_start|>user\n{{ .Prompt }}<|im_end|>\n{{ end }}<|im_start|>assistant\n\"\"\"\nPARAMETER stop \"<|system|>\"\nPARAMETER stop \"<|user|>\"\nPARAMETER stop \"<|assistant|>\"\nPARAMETER stop \"<|/s>\"`

      // Define the path for the Modelfile
      const modelNameWithoutExtension = model.fileName.replace('.gguf', '')
      const modelfilePath = path.join(localFilePath, `Modelfile-${modelNameWithoutExtension}`)

      try {
        // Write the Modelfile to the localFilePath
        await fs.writeFile(modelfilePath, modelfileTemplate, 'utf8')
        console.log(`Modelfile written to ${modelfilePath}`)

        // Create payload for the Ollama API
        const apiPayload = {
          model: model.fileName,
          modelfile: modelfileTemplate,
          path: modelfilePath, // Update the path to the newly created Modelfile
        }

        const apiCreateUrl = new URL('/api/create', OLLAMA_URL).href
        const response = await fetch(apiCreateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(apiPayload),
        })

        if (!response.ok) {
          console.error(`Failed to call Ollama API for ${model.fileName}:`, await response.text())
          results.push({
            fileName: model.fileName,
            status: 'error',
            message: `Failed to add GGUF model: ${model.fileName}`,
          })
          continue
        }

        console.log(`SUCCESS: Added model: ${model.fileName} to Ollama`)
        results.push({
          fileName: model.fileName,
          status: 'success',
          message: `Added model: ${model.fileName} to Ollama`,
        })
      } catch (err) {
        console.error(`Failed to process ${model.fileName}:`, err)
        results.push({
          fileName: model.fileName,
          status: 'error',
          message: `Failed to process ${model.fileName}`,
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
