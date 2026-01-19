import payload from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'

const url = process.argv[2]
if (!url) {
  console.error('Error: No URL provided')
  process.exit(1)
}

try {
  await payload.init({
    secret: process.env.PAYLOAD_SECRET || '',
    db: sqliteAdapter({
      client: { url: 'file:./database.db' },
    }),
  })

  await payload.updateGlobal({
    slug: 'llm-config',
    data: { llmURL: url },
  })

  console.log(`LLM URL successfully saved: ${url}`)
} catch (err) {
  console.log('Warning: Could not save LLM URL yet (Payload/DB is still starting)')
  console.log('You may set it manually later in the admin panel')
}

process.exit(0)