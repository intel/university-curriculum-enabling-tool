import { getPayload } from 'payload'
import config from '@payload-config'
import { ImageEmbeddingChunk } from '../types/image-embedding-chunk'
import { ClientSource } from '../types/client-source'
import type { Embedding, Media } from '@/payload-types'

export async function getAllImageEmbeddings(
  selectedSources: ClientSource[],
): Promise<ImageEmbeddingChunk[]> {
  const sourceIds = selectedSources.map((s) => s.id)
  if (sourceIds.length === 0) return []
  const payload = await getPayload({ config })
  const cmsResponse = await payload.find({
    collection: 'embeddings',
    where: {
      and: [
        { source: { in: sourceIds } },
        { media: { not_equals: null } },
        { chunk: { equals: null } },
      ],
    },
    depth: 2,
    limit: 0,
  })
  return cmsResponse.docs
    .filter(
      (doc: Embedding) =>
        doc.media &&
        !doc.chunk &&
        doc.media &&
        typeof doc.media === 'object' &&
        'filename' in doc.media,
    )
    .map((doc: Embedding) => ({
      order: 0,
      embedding: Array.isArray(doc.embedding)
        ? (doc.embedding as number[])
        : JSON.parse(doc.embedding as string),
      sourceId: typeof doc.source === 'number' ? doc.source : doc.source.id,
      sourceType: 'stored' as const,
      filename:
        doc.media && typeof doc.media === 'object' && 'filename' in doc.media
          ? (doc.media as Media).filename
          : '',
    }))
}
