// storage-adapter-import-placeholder
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
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
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL ?? 'file:./database.db',
    },
    prodMigrations: migrations,
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
})
