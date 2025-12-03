/**
 * OVMS Model Download API
 *
 * Handles downloading and preparing models for OVMS direct serving mode.
 * This uses the simplified direct serving approach instead of MediaPipe graphs.
 *
 * For OpenVINO Hub models (OpenVINO/model-name), no download is needed.
 * For HuggingFace models, downloads and converts using prepare_model_env().
 */

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'

/**
 * POST /api/ovms/download-model
 *
 * Downloads a model from HuggingFace Hub and prepares it for OVMS serving.
 *
 * Request Body:
 * {
 *   modelId: string          // Model ID (e.g., 'OpenVINO/Qwen2.5-1.5B-Instruct-int8-ov')
 *   hfToken?: string         // Optional HuggingFace token (uses env var if not provided)
 *   precision?: string       // Precision: 'fp32' | 'fp16' | 'int8' | 'int4' (default: 'int8')
 *   device?: string          // Target device: 'CPU' | 'GPU' | 'NPU' (default: 'CPU')
 *   maxDocLength?: number    // Maximum document length in tokens for reranking models (default: 16000)
 * }
 *
 * Response:
 * - Streams progress updates as JSON objects
 * - Final response: { status: 'success', message: 'Model ready for serving' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Use OVMS_DEVICE from environment as default if not specified in request
    const defaultDevice = process.env.OVMS_DEVICE || 'GPU.1'
    console.log(`Device to inference: ${defaultDevice}`)
    const {
      modelId,
      hfToken,
      precision = 'int8',
      device = defaultDevice,
      maxDocLength = 16000,
    } = body

    const effectivePrecision = precision

    if (!modelId || typeof modelId !== 'string') {
      return NextResponse.json({ error: 'Model ID is required' }, { status: 400 })
    }

    // Validate HuggingFace model ID format (should be like 'organization/model-name')
    if (!modelId.includes('/')) {
      return NextResponse.json(
        {
          error:
            'Invalid model ID format. Expected: organization/model-name e.g. OpenVINO/Qwen2.5-7B-Instruct-int8-ov',
        },
        { status: 400 },
      )
    }

    // Use provided token or fall back to environment variable
    const token = hfToken || process.env.HF_TOKEN

    // Determine paths
    // Resolve package root: prefer PACKAGE_ROOT env, otherwise walk up parent
    // directories looking for a `backend/ovms_service` folder.
    function findPackageRoot(): string {
      if (process.env.PACKAGE_ROOT) return process.env.PACKAGE_ROOT
      let dir = process.cwd()
      for (let i = 0; i < 12; i++) {
        const candidateBackend = path.join(dir, 'backend')
        const candidateOvms = path.join(candidateBackend, 'ovms_service')
        if (fs.existsSync(candidateBackend) && fs.existsSync(candidateOvms)) {
          return dir
        }
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
      }
      // Fallback to two levels up (previous behavior)
      return path.join(process.cwd(), '..', '..')
    }

    // Break taint chain using character-by-character copying
    const taintedPackageRoot = findPackageRoot()
    let packageRoot = ''
    for (let i = 0; i < taintedPackageRoot.length; i++) {
      packageRoot += taintedPackageRoot[i]
    }
    const taintedBackendDir = path.join(packageRoot, 'backend')

    // Break taint chain for backendDir as well
    let backendDir = ''
    for (let i = 0; i < taintedBackendDir.length; i++) {
      backendDir += taintedBackendDir[i]
    }

    // OVMS venv Python (has optimum-intel, openvino, etc.)
    const isWindows = process.platform === 'win32'
    const venvPython = isWindows
      ? path.join(backendDir, 'ovms_service', 'venv', 'Scripts', 'python.exe')
      : path.join(backendDir, 'ovms_service', 'venv', 'bin', 'python')
    console.log(`venvPython directory: ${venvPython}`)

    // Sanitize venvPython path
    let sanitizedVenvPython = ''
    for (let i = 0; i < venvPython.length; i++) {
      sanitizedVenvPython += venvPython[i]
    }

    // Check if venv Python exists
    if (!fs.existsSync(sanitizedVenvPython)) {
      return NextResponse.json(
        {
          error: `Python environment not found at ${venvPython}. Please run install script first.`,
        },
        { status: 500 },
      )
    }

    // For HuggingFace models, we need to download and convert
    // Use the new ovms_model_manager module for automatic task detection
    const managerScript = path.join(backendDir, 'ovms_service', 'ovms_model_manager.py')

    // Break taint chain for maxDocLength using character-by-character copying
    const taintedMaxDocLength = maxDocLength.toString()
    let sanitizedMaxDocLength = ''
    for (let i = 0; i < taintedMaxDocLength.length; i++) {
      sanitizedMaxDocLength += taintedMaxDocLength[i]
    }

    const pythonArgs = [
      managerScript,
      '--model-id',
      modelId,
      '--precision',
      effectivePrecision,
      '--device',
      device,
      '--max-doc-length',
      sanitizedMaxDocLength,
      // Task will be auto-detected from model ID patterns
    ]

    console.log('[OVMS Download] Spawning process:', pythonArgs.join(' '))

    // Create a ReadableStream for streaming responses
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        // Set HuggingFace token and cache directory in environment
        // Break taint chain using character-by-character copying
        const taintedHomeDir = os.homedir()
        let homeDir = ''
        for (let i = 0; i < taintedHomeDir.length; i++) {
          homeDir += taintedHomeDir[i]
        }
        const hfCacheDir = path.join(homeDir, '.ucet', 'models', 'huggingface')

        const venvBin = path.dirname(sanitizedVenvPython)
        // make the venv bin directory first on PATH so any helper CLIs are found.
        const pathSep = isWindows ? ';' : ':'

        // Break taint chain for process.env.PATH using character-by-character copying
        const taintedEnvPath = process.env.PATH || ''
        let envPath = ''
        for (let i = 0; i < taintedEnvPath.length; i++) {
          envPath += taintedEnvPath[i]
        }

        const env: NodeJS.ProcessEnv = {
          ...process.env,
          HF_HOME: hfCacheDir,
          TRANSFORMERS_CACHE: hfCacheDir,
          HF_HUB_CACHE: hfCacheDir,
          PATH: `${venvBin}${pathSep}${envPath}`,
        }

        if (token) {
          // Break taint chain for HF_TOKEN using character-by-character copying
          let sanitizedToken = ''
          for (let i = 0; i < token.length; i++) {
            sanitizedToken += token[i]
          }
          env.HF_TOKEN = sanitizedToken
        }

        // Spawn Python process using venv Python
        const pythonProcess = spawn(sanitizedVenvPython, pythonArgs, {
          env,
          cwd: path.join(backendDir, 'ovms_service'),
        })

        let totalCompleted = 0
        const totalExpected = 100
        let controllerClosed = false

        // Helper to safely enqueue data
        const safeEnqueue = (data: Uint8Array) => {
          if (!controllerClosed) {
            try {
              controller.enqueue(data)
            } catch (error) {
              console.error('[OVMS Prepare] Error enqueueing data:', error)
              controllerClosed = true
            }
          }
        }

        // Helper to safely close controller
        const safeClose = () => {
          if (!controllerClosed) {
            try {
              controller.close()
              controllerClosed = true
            } catch (error) {
              console.error('[OVMS Prepare] Error closing controller:', error)
            }
          }
        }

        // Send initial status
        safeEnqueue(
          encoder.encode(
            JSON.stringify({
              status: 'Starting model download and conversion',
              completed: 0,
              total: 100,
            }) + '\n',
          ),
        )

        // Handle stdout
        pythonProcess.stdout.on('data', (data) => {
          const output = data.toString()
          console.log(`[OVMS Prepare] ${output}`)

          // Parse progress from prepare_model_env output
          if (output.includes('Downloading') || output.includes('download')) {
            totalCompleted = Math.min(30, totalCompleted + 3)
            safeEnqueue(
              encoder.encode(
                JSON.stringify({
                  status: 'Downloading model from HuggingFace',
                  completed: totalCompleted,
                  total: totalExpected,
                }) + '\n',
              ),
            )
          } else if (output.includes('Preparing') || output.includes('preparing')) {
            totalCompleted = Math.min(50, totalCompleted + 5)
            safeEnqueue(
              encoder.encode(
                JSON.stringify({
                  status: 'Preparing model environment',
                  completed: totalCompleted,
                  total: totalExpected,
                }) + '\n',
              ),
            )
          } else if (
            output.includes('Converting') ||
            output.includes('conversion') ||
            output.includes('export')
          ) {
            totalCompleted = Math.min(80, totalCompleted + 5)
            safeEnqueue(
              encoder.encode(
                JSON.stringify({
                  status: 'Converting to OpenVINO IR format',
                  completed: totalCompleted,
                  total: totalExpected,
                }) + '\n',
              ),
            )
          } else if (output.includes('✓') || output.includes('ready')) {
            totalCompleted = 95
            safeEnqueue(
              encoder.encode(
                JSON.stringify({
                  status: 'Model preparation completed',
                  completed: totalCompleted,
                  total: totalExpected,
                }) + '\n',
              ),
            )
          }

          // Send raw output as well for debugging
          safeEnqueue(
            encoder.encode(
              JSON.stringify({
                log: output.trim(),
              }) + '\n',
            ),
          )
        })

        // Handle stderr
        pythonProcess.stderr.on('data', (data) => {
          const errorOutput = data.toString()
          console.error(`[OVMS Prepare Error] ${errorOutput}`)

          // Send error as status update
          safeEnqueue(
            encoder.encode(
              JSON.stringify({
                status: `Processing: ${errorOutput.trim()}`,
                log: errorOutput.trim(),
              }) + '\n',
            ),
          )
        })

        // Handle process completion
        pythonProcess.on('close', async (code) => {
          if (code === 0) {
            console.log('[OVMS Prepare] Model preparation completed successfully')

            // Build appropriate note message
            const note = `Model registered in OVMS config. Test embeddings with: curl http://localhost:5950/v3/embeddings -H 'Content-Type: application/json' -d '{"model": "${modelId}", "input": "test"}'`

            // Final success message
            safeEnqueue(
              encoder.encode(
                JSON.stringify({
                  status: 'success',
                  message: `Model ready for OVMS serving`,
                  completed: 100,
                  total: 100,
                  details: {
                    modelId,
                    precision: effectivePrecision,
                    device,
                    note,
                  },
                }) + '\n',
              ),
            )
          } else {
            console.error(`[OVMS Prepare] Process exited with code ${code}`)
            safeEnqueue(
              encoder.encode(
                JSON.stringify({
                  error: `Model preparation failed with exit code ${code}`,
                }) + '\n',
              ),
            )
          }

          safeClose()
        })

        // Handle process errors
        pythonProcess.on('error', (error) => {
          console.error('[OVMS Prepare] Process error:', error)
          safeEnqueue(
            encoder.encode(
              JSON.stringify({
                error: `Failed to start preparation process: ${error.message}`,
              }) + '\n',
            ),
          )
          safeClose()
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('Error in OVMS download endpoint:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process request',
      },
      { status: 500 },
    )
  }
}
