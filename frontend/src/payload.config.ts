// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

// storage-adapter-import-placeholder
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { LLMConfig } from './globals/llm-config'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { migrations } from './migrations'
import { Sources } from './collections/Sources'
import { Chunks } from './collections/Chunks'
import { Embeddings } from './collections/Embeddings'
import { Media } from './collections/Media'
import { Courses } from './collections/Courses'
import { Programmes } from './collections/Programmes'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Sources, Chunks, Embeddings, Media, Programmes, Courses],
  globals: [LLMConfig],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL ?? 'file:./database.db',
    },
    migrationDir:
      process.env.STANDALONE_BUILD === 'true' ? undefined : path.resolve(dirname, './migrations'),
    prodMigrations: process.env.STANDALONE_BUILD === 'true' ? undefined : migrations,
  }),
  // collections: [
  //   {
  //     slug: 'sources',
  //     fields: [
  //       { name: 'name', type: 'text', required: true },
  //       { name: 'content', type: 'code', required: true },
  //       { name: 'type', type: 'select', options: ['pdf', 'txt', 'md', 'mp3', 'wav'], required: true },
  //       { name: "metadata", type: "json" },
  //     ],
  //   },
  //   {
  //     slug: 'chunks',
  //     fields: [
  //       { name: 'source', type: 'relationship', relationTo: 'sources', required: true },
  //       { name: 'chunk', type: 'code', required: true },
  //       { name: 'location', type: 'json', required: false },
  //       { name: 'order', type: 'number', required: true },
  //     ],
  //   },
  //   {
  //     slug: 'embeddings',
  //     fields: [
  //       { name: 'source', type: 'relationship', relationTo: 'sources', required: true },
  //       { name: 'chunk', type: 'relationship', relationTo: 'chunks', required: true },
  //       { name: 'embedding', type: 'json', required: true },
  //     ],
  //   },
  // ],
  sharp,
  plugins: [
    // storage-adapter-placeholder
  ],
  onInit: async (payload) => {
    // Initialize LLM config with provider type from installation
    try {
      const existingConfig = await payload.findGlobal({
        slug: 'llm-config',
      })

      // Only initialize if config doesn't exist yet (first run)
      if (!existingConfig || !existingConfig.providerType) {
        const providerType = (
          process.env.PROVIDER ||
          process.env.NEXT_PUBLIC_SERVICE ||
          'ovms'
        ).toLowerCase()
        const validProvider =
          providerType === 'ollama' || providerType === 'ovms' ? providerType : 'ovms'

        payload.logger.info(`[Init] Initializing llm-config with provider: ${validProvider}`)

        await payload.updateGlobal({
          slug: 'llm-config',
          data: {
            providerType: validProvider,
            llmURL: 'http://localhost:5950',
          },
        })

        payload.logger.info(`[Init] Successfully initialized llm-config`)
      } else {
        payload.logger.info(
          `[Init] llm-config already exists with provider: ${existingConfig.providerType}`,
        )
      }
    } catch (error) {
      payload.logger.error(`[Init] Failed to initialize llm-config: ${error}`)
    }
  },
})
