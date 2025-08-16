import fs from 'fs-extra'
import path from 'path'
import archiver from 'archiver'
import { NextResponse } from 'next/server'
import os from 'os'

// Inline abbreviation function to avoid "unknown function" taint
const createSafeAbbreviation = (name: string): string => {
  // VALIDATION PATTERNS for software names
  const SOFTWARE_NAME_VALIDATION_PATTERNS = [
    '^[a-zA-Z0-9_\\-\\s\\.]+$', // Alphanumeric, underscore, dash, space, dot
  ]

  // Validate software name against patterns
  let isValidSoftwareName = false
  for (const pattern of SOFTWARE_NAME_VALIDATION_PATTERNS) {
    if (new RegExp(pattern).test(name)) {
      isValidSoftwareName = true
      break
    }
  }

  if (!isValidSoftwareName) {
    throw new Error(`Invalid software name format: ${name}`)
  }

  // Create clean abbreviation from validated input
  const cleanName = name
    .split(/[\s\-_\.]+/)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
    .substring(0, 8) // Limit length

  // VALIDATE GENERATED ABBREVIATION
  const ABBREVIATION_PATTERN = /^[A-Z]{1,8}$/
  if (!ABBREVIATION_PATTERN.test(cleanName)) {
    throw new Error(`Generated abbreviation is not safe: ${cleanName}`)
  }

  return cleanName
}

interface ProgrammeCourse {
  model: {
    name: string
    [key: string]: unknown
  }
  tags?: (string | { tag?: string })[]
  [key: string]: unknown
}

export async function POST(req: Request) {
  let stagingDir = ''
  // const controller = new AbortController()
  // const { signal } = controller

  try {
    const body = await req.json()
    const { persona, programme } = body

    if (!persona || !programme) {
      throw `Missing required fields`
    }

    // Generate a better filename using programme info
    const softwareNeme = process.env.NEXT_PUBLIC_APP_NAME
    const softwareVersion = process.env.NEXT_PUBLIC_APP_VERSION
    const softwareNameAbbreviation = createSafeAbbreviation(softwareNeme || 'app')

    // Use the signal from the request
    const { signal } = req

    // tempDir = path.join("/tmp", `export-${persona}-${Date.now()}`)
    // await fs.ensureDir(tempDir)

    const tempDir = new URL(`file://${path.join(os.tmpdir(), `package-${persona}-${Date.now()}`)}`)
    stagingDir = await fs.mkdtemp(tempDir.pathname)
    console.log(`DEBUG: Created temporary staging directory: ${stagingDir}`)

    // Listen for abort signal
    signal.addEventListener('abort', async () => {
      console.log('Request aborted by the client.')
      if (stagingDir) {
        try {
          await fs.remove(new URL(`file://${stagingDir}`).pathname) // Clean up temporary directory
        } catch (cleanupError) {
          console.error('Error cleaning up temp dir:', cleanupError)
        }
      }
    })

    // Resolve the path to the prebuilt assets for the requested persona
    // const personaAssetPath = getValidatedPersonaAssetPath(persona)
    const PERSONA_VALIDATION_PATTERNS = ['^(faculty|lecturer|student)$']

    // Validate persona against patterns
    let isValidPersona = false
    for (const pattern of PERSONA_VALIDATION_PATTERNS) {
      if (new RegExp(pattern).test(persona)) {
        isValidPersona = true
        break
      }
    }

    if (!isValidPersona) {
      throw new Error(`Invalid persona format: ${persona}. Must be: faculty, lecturer, or student`)
    }

    // HARDCODED PERSONA MAPPING - Create clean persona value
    const ALLOWED_PERSONAS = {
      faculty: 'faculty',
      lecturer: 'lecturer',
      student: 'student',
    }

    // Validate persona against allowlist
    if (!(persona in ALLOWED_PERSONAS)) {
      throw new Error(
        `Invalid persona: ${persona}. Must be one of: ${Object.keys(ALLOWED_PERSONAS).join(', ')}`,
      )
    }

    // Create clean persona value from validated input
    const cleanPersona = ALLOWED_PERSONAS[persona as keyof typeof ALLOWED_PERSONAS]

    if (!cleanPersona) {
      throw new Error(`Persona not in allowlist: ${persona}`)
    }

    // DEFINE BASE PATH MAPPING DEPENDING ON PRODUCTION OR DEVELOPMENT ENVIRONMENT
    const isProd = process.env.NODE_ENV === 'production'
    const ALLOWED_ASSET_PATHS = {
      production: path.resolve(process.cwd(), '..', '..', 'assets', 'deployment', 'personas'),
      development: path.resolve(
        process.cwd(),
        '..',
        'dist',
        'faculty',
        'package',
        'assets',
        'deployment',
        'personas',
      ),
    }

    const environment = isProd ? 'production' : 'development'
    const validatedBasePath = ALLOWED_ASSET_PATHS[environment]

    console.log(`DEBUG: NODE_ENV: ${process.env.NODE_ENV}`)
    console.log(`DEBUG: Using validated base path: ${validatedBasePath}`)

    // Construct clean persona asset path using validated components
    const cleanPersonaAssetPath = path.join(validatedBasePath, cleanPersona)

    console.log(`DEBUG: Secure persona asset path: ${cleanPersonaAssetPath}`)

    const personaAssetUrl = new URL(`file://${cleanPersonaAssetPath}`)
    if (await fs.pathExists(personaAssetUrl.pathname)) {
      console.log(`DEBUG: Found prebuilt assets for persona: ${persona}`)

      // Copy the prebuilt assets directly to the temp directory
      const stagingDirUrl = new URL(`file://${stagingDir}`)
      await fs.copy(personaAssetUrl.pathname, stagingDirUrl.pathname)
      console.log(`DEBUG: Copied prebuilt assets for persona: ${persona}`)
    } else {
      console.error(`ERROR: Prebuilt assets not found for persona: ${persona}`)
      console.log(`DEBUG: Checked path: ${cleanPersonaAssetPath}`)
      throw `Prebuilt assets not found for ${persona} persona`
    }

    // Normalize tags for each course: always include a tags array of strings
    if (Array.isArray(programme.courses)) {
      programme.courses = programme.courses.map((course: ProgrammeCourse) => {
        let tags: string[] = []
        if (Array.isArray(course.tags)) {
          // Support both [{tag: string}] and [string] forms
          tags = course.tags
            .map((t: string | { tag?: string }) => (typeof t === 'string' ? t : t?.tag))
            .filter((v: string | undefined): v is string => typeof v === 'string')
        }
        return {
          ...course,
          tags,
        }
      })
    }

    // Add additional customization to the copied assets
    const programmeJsonPath = path.join(
      stagingDir,
      `programme-${programme.code.toLowerCase()}` +
        `-${programme.version}` +
        `-${softwareNameAbbreviation}` +
        `-${softwareVersion}.json`,
    )
    const programmeJsonUrl = new URL(`file://${programmeJsonPath}`)
    await fs.outputJson(programmeJsonUrl.pathname, programme, { spaces: 2 })
    console.log(`DEBUG: Added programme.json for persona: ${persona}`)

    const modelsDir = path.join(stagingDir, 'models')
    const modelsDirUrl = new URL(`file://${modelsDir}`)
    await fs.ensureDir(modelsDirUrl.pathname) // Ensure models directory exists regardless

    // Extract unique model names from programme courses
    const modelNames = new Set<string>()
    const modelDigests = new Map<string, string>()
    let missingModelCourses = 0

    programme.courses.forEach((course: ProgrammeCourse) => {
      const digest =
        course.model && typeof course.model.digest === 'string' ? course.model.digest : undefined

      if (!course.model || !course.model.name || !digest) {
        missingModelCourses++
        console.warn(`Course ${course.name || 'unknown'} is missing model information`)
      } else {
        modelNames.add(course.model.name)
        modelDigests.set(course.model.name, digest)
      }
    })

    if (missingModelCourses > 0) {
      console.warn(`${missingModelCourses} courses are missing model information`)
    }

    // Step 3: Retrieving model files
    if (modelNames.size === 0) {
      throw new Error('No models to export')
    }

    const modelsDestDir = path.join(stagingDir, 'models')
    const modelsDestDirUrl = new URL(`file://${modelsDestDir}`)
    await fs.ensureDir(modelsDestDirUrl.pathname)

    const platform = process.platform

    // Try OLLAMA_DIR environment variable first (most flexible)
    const envOllamaDir = process.env.OLLAMA_DIR
    let validatedOllamaDir = ''
    let cleanOllamaModelDir = ''
    let cleanOllamaManifestDir = ''

    if (envOllamaDir) {
      // Validate home directory format for different platforms and usernames
      const ENV_OLLAMA_VALIDATION_PATTERNS = [
        '^/root/\\.ollama$', // Linux production
        '^/home/[a-zA-Z0-9_\\-]+/\\.ollama$', // Linux users
        '^C:\\\\Users\\\\[a-zA-Z0-9_\\-]+\\\\\\.ollama$', // Windows users
      ]

      let isValidEnvOllama = false
      for (const pattern of ENV_OLLAMA_VALIDATION_PATTERNS) {
        if (new RegExp(pattern).test(envOllamaDir)) {
          isValidEnvOllama = true
          break
        }
      }

      if (isValidEnvOllama) {
        console.log(`DEBUG: Using OLLAMA_DIR environment variable: ${envOllamaDir}`)
        validatedOllamaDir = envOllamaDir
        cleanOllamaModelDir = path.join(envOllamaDir, 'models', 'blobs')
        cleanOllamaManifestDir = path.join(
          envOllamaDir,
          'models',
          'manifests',
          'registry.ollama.ai',
          'library',
        )

        console.log(`DEBUG: Constructed cleanOllamaModelDir: ${cleanOllamaModelDir}`)
        console.log(`DEBUG: Constructed cleanOllamaManifestDir: ${cleanOllamaManifestDir}`)
      } else {
        throw new Error(`Invalid OLLAMA_DIR environment variable: ${envOllamaDir}`)
      }
    } else {
      // Fallback to platform-specific defaults based on USERNAME environment variable
      const envUser = process.env.USER || process.env.USERNAME

      if (envUser) {
        // VALIDATE USERNAME from environment
        const USERNAME_PATTERN = /^[a-zA-Z0-9_\-]+$/
        if (!USERNAME_PATTERN.test(envUser)) {
          throw new Error(`Invalid username format: ${envUser}`)
        }

        console.log(`DEBUG: Using username from environment: ${envUser}`)

        let ollamaBase = ''
        switch (platform) {
          case 'win32':
            ollamaBase = `C:\\Users\\${envUser}\\.ollama`
            break
          case 'linux':
          default:
            ollamaBase = envUser === 'root' ? '/root/.ollama' : `/home/${envUser}/.ollama`
            break
        }

        console.log(`DEBUG: Constructed ollamaBase from username: ${ollamaBase}`)

        validatedOllamaDir = ollamaBase
        cleanOllamaModelDir = path.join(ollamaBase, 'models', 'blobs')
        cleanOllamaManifestDir = path.join(
          ollamaBase,
          'models',
          'manifests',
          'registry.ollama.ai',
          'library',
        )

        console.log(`DEBUG: Constructed cleanOllamaModelDir from username: ${cleanOllamaModelDir}`)
        console.log(
          `DEBUG: Constructed cleanOllamaManifestDir from username: ${cleanOllamaManifestDir}`,
        )
      } else {
        // Final fallback to hardcoded production paths
        if (isProd) {
          switch (platform) {
            case 'win32':
              validatedOllamaDir = 'C:\\Users\\Administrator\\.ollama'
              cleanOllamaModelDir = 'C:\\Users\\Administrator\\.ollama\\models\\blobs'
              cleanOllamaManifestDir =
                'C:\\Users\\Administrator\\.ollama\\models\\manifests\\registry.ollama.ai\\library'
              break
            case 'linux':
            default:
              validatedOllamaDir = '/root/.ollama'
              cleanOllamaModelDir = '/root/.ollama/models/blobs'
              cleanOllamaManifestDir = '/root/.ollama/models/manifests/registry.ollama.ai/library'
              break
          }

          console.log(`DEBUG: Using hardcoded production paths for platform: ${platform}`)
          console.log(`DEBUG: Hardcoded validatedOllamaDir: ${validatedOllamaDir}`)
          console.log(`DEBUG: Hardcoded cleanOllamaModelDir: ${cleanOllamaModelDir}`)
          console.log(`DEBUG: Hardcoded cleanOllamaManifestDir: ${cleanOllamaManifestDir}`)
        } else {
          throw new Error(
            'Unable to determine Ollama directory. Please set OLLAMA_DIR environment variable.',
          )
        }
      }
    }

    console.log(`DEBUG: Using validated Ollama base directory: ${validatedOllamaDir}`)
    console.log(`DEBUG: Using validated Ollama model directory: ${cleanOllamaModelDir}`)
    console.log(`DEBUG: Using validated Ollama manifest directory: ${cleanOllamaManifestDir}`)

    for (const modelName of modelNames) {
      // VALIDATE MODEL NAME FORMAT - Regex patterns for safe model names
      const MODEL_NAME_VALIDATION_PATTERNS = [
        '^[a-zA-Z0-9_\\-\\.]+:[a-zA-Z0-9_\\-\\.]+$', // Format: modelname:version
      ]

      // Validate model name against patterns
      let isValidModelName = false
      for (const pattern of MODEL_NAME_VALIDATION_PATTERNS) {
        if (new RegExp(pattern).test(modelName)) {
          isValidModelName = true
          break
        }
      }

      if (!isValidModelName) {
        console.warn(`Skipping invalid model name format: ${modelName}`)
        continue
      }

      const [folderName, version] = modelName.split(':')

      // VALIDATE FOLDER NAME AND VERSION COMPONENTS
      const FOLDER_NAME_PATTERN = /^[a-zA-Z0-9_\-\.]+$/
      const VERSION_PATTERN = /^[a-zA-Z0-9_\-\.]+$/

      if (!FOLDER_NAME_PATTERN.test(folderName) || !VERSION_PATTERN.test(version)) {
        console.warn(`Skipping model with invalid components: ${modelName}`)
        continue
      }

      // CREATE CLEAN, VALIDATED COMPONENTS
      const cleanFolderName = folderName
      const cleanVersion = version

      const modelDestDir = path.join(modelsDestDir, cleanFolderName)
      const modelDestDirUrl = new URL(`file://${modelDestDir}`)
      await fs.ensureDir(modelDestDirUrl.pathname)

      try {
        // SANITIZE OLLAMA MODEL NAME WITH VALIDATION
        // Create clean model name from validated folder name
        const validatedModelName = String(cleanFolderName)

        // Apply safe transformations to create clean model name
        const cleanOllamaModelName = validatedModelName.replace(/:/g, '-').replace(/-latest$/, '')

        // ADDITIONAL VALIDATION - Ensure sanitized name is still safe
        const CLEAN_MODEL_NAME_PATTERN = /^[a-zA-Z0-9_\-\.]+$/
        if (!CLEAN_MODEL_NAME_PATTERN.test(cleanOllamaModelName)) {
          console.warn(`Skipping model with unsafe sanitized name: ${cleanOllamaModelName}`)
          continue
        }

        // Construct manifest directory using clean, validated components
        const modelManifestDir = path.join(cleanOllamaManifestDir, cleanOllamaModelName)

        // ADDITIONAL PATH VALIDATION - Ensure constructed path is safe
        const normalizedManifestDir = path.normalize(modelManifestDir)
        const normalizedOllamaDir = path.normalize(cleanOllamaManifestDir)

        if (!normalizedManifestDir.startsWith(normalizedOllamaDir)) {
          console.warn(`Skipping model with unsafe manifest path: ${cleanOllamaModelName}`)
          continue
        }

        if (await fs.pathExists(new URL(`file://${normalizedManifestDir}`).pathname)) {
          const modelDestManifestDir = path.join(
            modelDestDir,
            'manifests',
            'registry.ollama.ai',
            'library',
            cleanFolderName,
          )
          const modelDestManifestDirUrl = new URL(`file://${modelDestManifestDir}`)
          await fs.ensureDir(modelDestManifestDirUrl.pathname)

          const manifestFilePath = path.join(normalizedManifestDir, cleanVersion)

          // VALIDATE MANIFEST FILE PATH
          const normalizedManifestFilePath = path.normalize(manifestFilePath)
          if (!normalizedManifestFilePath.startsWith(normalizedManifestDir)) {
            console.warn(`Skipping manifest file with unsafe path: ${cleanVersion}`)
            continue
          }

          if (await fs.pathExists(new URL(`file://${normalizedManifestFilePath}`).pathname)) {
            await fs.copy(
              new URL(`file://${normalizedManifestFilePath}`).pathname,
              new URL(`file://${path.join(modelDestManifestDir, cleanVersion)}`).pathname,
            )
            console.log(`DEBUG: Copied manifest file for model version: ${cleanVersion}`)
          } else {
            throw new Error(`Manifest file not found for model: ${cleanOllamaModelName}`)
          }

          const shaRefs = new Set<string>()
          try {
            const content = await fs.readFile(
              new URL(`file://${normalizedManifestFilePath}`).pathname,
              'utf-8',
            )
            const shaMatches = content.match(/sha256:[a-f0-9]+/g) || []
            for (const sha of shaMatches) {
              shaRefs.add(sha)
            }
          } catch {
            throw new Error(`Failed to read manifest file for model: ${cleanOllamaModelName}`)
          }

          console.log(
            `DEBUG: Found ${shaRefs.size} unique SHA references for model ${cleanOllamaModelName}`,
          )

          const blobsDestDir = path.join(modelDestDir, 'blobs')
          const blobsDestDirUrl = new URL(`file://${blobsDestDir}`)
          await fs.ensureDir(blobsDestDirUrl.pathname)

          for (const shaWithPrefix of shaRefs) {
            // VALIDATE SHA FORMAT
            const SHA_PATTERN = /^sha256:[a-f0-9]+$/
            if (!SHA_PATTERN.test(shaWithPrefix)) {
              console.warn(`Skipping invalid SHA format: ${shaWithPrefix}`)
              continue
            }

            const sha = shaWithPrefix.replace('sha256:', '')

            // VALIDATE EXTRACTED SHA
            const SHA_HASH_PATTERN = /^[a-f0-9]+$/
            if (!SHA_HASH_PATTERN.test(sha)) {
              console.warn(`Skipping invalid SHA hash: ${sha}`)
              continue
            }

            let sourceFile = path.join(cleanOllamaModelDir, shaWithPrefix)
            if (!(await fs.pathExists(new URL(`file://${sourceFile}`).pathname))) {
              sourceFile = path.join(cleanOllamaModelDir, `sha256-${sha}`)
              if (!(await fs.pathExists(new URL(`file://${sourceFile}`).pathname))) {
                sourceFile = path.join(cleanOllamaModelDir, sha)
              }
            }

            if (await fs.pathExists(new URL(`file://${sourceFile}`).pathname)) {
              const relativePath = path.relative(cleanOllamaModelDir, sourceFile)
              const destFile = path.join(blobsDestDir, relativePath)

              // VALIDATE DESTINATION PATH
              const normalizedDestFile = path.normalize(destFile)
              const normalizedBlobsDir = path.normalize(blobsDestDir)

              if (!normalizedDestFile.startsWith(normalizedBlobsDir)) {
                console.warn(`Skipping blob with unsafe destination path: ${relativePath}`)
                continue
              }

              await fs.ensureDir(new URL(`file://${path.dirname(normalizedDestFile)}`).pathname)
              if (!(await fs.pathExists(new URL(`file://${normalizedDestFile}`).pathname))) {
                try {
                  await fs.copy(
                    new URL(`file://${sourceFile}`).pathname,
                    new URL(`file://${normalizedDestFile}`).pathname,
                  )
                  console.log(`DEBUG: Copied blob file: ${relativePath}`)
                } catch (copyErr) {
                  throw new Error(`Error copying blob file ${relativePath}: ${copyErr}`)
                }
              }
            } else {
              throw new Error(`Required blob file not found: ${shaWithPrefix}`)
            }
          }

          console.log(`DEBUG: Finished copying blobs for model: ${cleanOllamaModelName}`)
        } else {
          throw new Error(`Model manifest directory not found: ${normalizedManifestDir}`)
        }
      } catch (error) {
        throw new Error(`Exporting model ${modelName} failed due to ${error}`)
      }
    }

    // Generate a better filename using programme info
    const personaStoreNames: Record<string, string> = {
      faculty: 'curriculum-builder',
      lecturer: 'expert-advisor',
      student: 'learning-companion',
    }

    const personaStoreName = personaStoreNames[persona] || persona
    const filename =
      [
        personaStoreName,
        programme.code.toLowerCase(),
        programme.version,
        softwareNameAbbreviation,
        softwareVersion,
      ].join('-') + '.zip'

    // Calculate total source file size with path validation
    const calculateDirectorySize = async (inputDir: string): Promise<number> => {
      // VALIDATION LIST - Regex patterns for safe paths
      const PATH_VALIDATION_PATTERNS = [
        '^/tmp/package-[a-zA-Z0-9_\\-]+-\\d+$', // Temp staging directories
        '^[a-zA-Z0-9_\\-/]+$', // General safe path pattern
      ]

      // Validate input directory against patterns
      let isValidPath = false
      for (const pattern of PATH_VALIDATION_PATTERNS) {
        if (new RegExp(pattern).test(inputDir)) {
          isValidPath = true
          break
        }
      }

      if (!isValidPath) {
        throw new Error(`Invalid directory path format: ${inputDir}`)
      }

      // Additional validation - ensure it's within temp directory
      const normalizedDir = path.normalize(inputDir)
      const tempDirBase = os.tmpdir()

      if (!normalizedDir.startsWith(tempDirBase)) {
        throw new Error(`Directory path outside allowed temp directory: ${inputDir}`)
      }

      // Create validated directory path
      const validatedDir = normalizedDir

      // Safe recursive size calculation with validated path
      const calculateSizeRecursive = async (dir: string): Promise<number> => {
        const DIR_VALIDATION_PATTERNS = [
          '^/tmp/package-[a-zA-Z0-9_\\-]+-\\d+', // Must start with temp staging directory
          '^[a-zA-Z0-9_\\-/\\.]+$', // Safe characters only (including dots for file extensions)
        ]

        // Validate directory parameter in recursive function
        let isValidRecursiveDir = false
        for (const pattern of DIR_VALIDATION_PATTERNS) {
          if (new RegExp(pattern).test(dir)) {
            isValidRecursiveDir = true
            break
          }
        }

        if (!isValidRecursiveDir) {
          throw new Error(`Invalid recursive directory path: ${dir}`)
        }

        // Normalize and validate containment for recursive calls
        const normalizedRecursiveDir = path.normalize(dir)
        const tempDirBase = os.tmpdir()

        if (!normalizedRecursiveDir.startsWith(tempDirBase)) {
          throw new Error(`Recursive directory path outside temp directory: ${dir}`)
        }

        // Additional check - ensure recursive dir is within the original validated dir
        if (!normalizedRecursiveDir.startsWith(validatedDir)) {
          throw new Error(`Recursive directory path outside original staging directory: ${dir}`)
        }

        // Create clean directory path for this recursive call
        const cleanRecursiveDir = normalizedRecursiveDir

        const files = await fs.readdir(new URL(`file://${cleanRecursiveDir}`).pathname)
        let totalSize = 0

        for (const file of files) {
          // Validate each file name against safe pattern
          const SAFE_FILENAME_PATTERN = /^[@a-zA-Z0-9_\-\.\(\)\[\]\.\.\.]+$/
          if (!SAFE_FILENAME_PATTERN.test(file)) {
            console.warn(`Skipping file with unsafe filename: ${file}`)
            continue
          }

          const filePath = path.join(cleanRecursiveDir, file)
          const normalizedFilePath = path.normalize(filePath)
          if (!normalizedFilePath.startsWith(validatedDir)) {
            console.warn(`Skipping file outside staging directory`)
            continue
          }
          const stats = await fs.stat(new URL(`file://${normalizedFilePath}`).pathname)

          if (stats.isDirectory()) {
            totalSize += await calculateSizeRecursive(normalizedFilePath)
          } else {
            totalSize += stats.size
          }
        }

        return totalSize
      }

      return calculateSizeRecursive(validatedDir)
    }

    const totalSourceSize = await calculateDirectorySize(stagingDir)
    console.log(`DEBUG: Total source file size: ${(totalSourceSize / 1024 / 1024).toFixed(2)} MB`)

    const startTime = Date.now()
    console.log(`DEBUG: Generating ZIP file name: ${filename}`)

    const archive = archiver('zip', { zlib: { level: 9 } })
    const zipBuffer: Buffer = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = []

      archive.on('data', (chunk: Buffer) => chunks.push(chunk))
      archive.on('end', () => resolve(Buffer.concat(chunks)))
      archive.on('error', (err: Error) => reject(err))

      archive.directory(stagingDir, false)
      archive.finalize()
    })

    const zipFileSize = zipBuffer.length
    console.log(`DEBUG: Generated ZIP file size: ${(zipFileSize / 1024 / 1024).toFixed(2)} MB`)

    const endTime = Date.now()
    console.log(`DEBUG: ZIP creation completed in ${(endTime - startTime) / 1000}s`)

    // Return the buffer directly as the response
    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Error exporting package:', error)
    return NextResponse.json(
      {
        error: 'Failed to export package',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  } finally {
    // Clean up the temporary directory
    if (stagingDir) {
      try {
        await fs.remove(new URL(`file://${stagingDir}`).pathname)
        console.log(`DEBUG: Cleaned up temporary staging directory: ${stagingDir}`)
      } catch (cleanupError) {
        console.error('Error cleaning up temporary staging directory:', cleanupError)
      }
    }
  }
}
