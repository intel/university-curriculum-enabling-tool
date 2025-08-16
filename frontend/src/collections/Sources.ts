import { errorResponse, successResponse } from '@/lib/api-response'
import { NextResponse } from 'next/server'
import type { CollectionConfig } from 'payload'
import { fileUploadHandler } from '@/lib/handler/file-upload-handler'

export const Sources: CollectionConfig = {
  slug: 'sources',
  upload: {
    staticDir: 'data/sources',
  },
  access: {
    read: () => true,
    delete: () => true,
    update: () => true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'content',
      type: 'code',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      options: ['pdf', 'txt', 'md', 'mp3', 'wav'],
      required: true,
    },
    {
      name: 'metadata',
      type: 'json',
      required: true,
    },
  ],
  hooks: {
    beforeDelete: [
      async ({ req, id }) => {
        console.log(`Deleting embeddings linked to source ID ${id}...`)
        await req.payload.delete({
          collection: 'embeddings',
          where: { source: { equals: id } },
        })
        console.log(`Embeddings deleted for source ID ${id}`)
        console.log(`Deleting chunks linked to source ID ${id}...`)
        await req.payload.delete({
          collection: 'chunks',
          where: { source: { equals: id } },
        })
        console.log(`Chunks deleted for source ID ${id}`)
        console.log(`Deleting media linked to source ID ${id}...`)
        await req.payload.delete({
          collection: 'media',
          where: { source: { equals: id } },
        })
        console.log(`Media deleted for source ID ${id}`)
      },
    ],
  },
  endpoints: [
    {
      path: '/list',
      method: 'get',
      handler: async (req) => {
        try {
          const sources = await req.payload.find({
            collection: 'sources',
            depth: 0, // Ensures no file relations are included
            limit: 50, // Optional: Limit results for performance
            pagination: false, // Optional: Disable pagination if needed
            // projection: { id: 1, name: 1, type: 1, content: 1, metadata: 1 },
          })
          const filteredSources = sources.docs.map(({ id, name, type, metadata }) => ({
            id,
            name,
            type,
            metadata,
          }))
          return successResponse(filteredSources, 'Data retrieved successfully', 200)
        } catch (error) {
          if (error instanceof Error) {
            // Return standardized error response
            return errorResponse(
              'Internal Server Error',
              { code: 'INTERNAL_ERROR', message: error.message },
              500,
            )
          } else if (typeof error === 'object' && error !== null && 'data' in error) {
            // Handle Payload CMS-specific errors
            return errorResponse(
              'Payload CMS Error',
              { code: 'PAYLOAD_ERROR', message: error.data },
              500,
            )
          } else {
            // Handle unknown errors
            return errorResponse('An unexpected error occurred', null, 500)
          }
        }
      },
    },
    {
      path: '/upload',
      method: 'post',
      handler: async (req): Promise<Response> => {
        try {
          const result = await fileUploadHandler(req)
          return NextResponse.json(result, { status: 201 })
        } catch (error) {
          console.log('error:', error)
          if (error instanceof Error) {
            return errorResponse(
              'Internal Server Error',
              { code: 'INTERNAL_ERROR', message: error.message },
              500,
            )
          } else if (typeof error === 'object' && error !== null && 'data' in error) {
            return errorResponse(
              'Payload CMS Error',
              { code: 'PAYLOAD_ERROR', message: error.data },
              500,
            )
          } else {
            return errorResponse('An unexpected error occurred', null, 500)
          }
        }
      },
    },
  ],
}
