import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: 'data/media',
  },
  access: {
    read: () => true,
    delete: () => true,
    update: () => true,
  },
  fields: [
    {
      name: 'source',
      type: 'relationship',
      relationTo: 'sources',
      required: true,
    },
    {
      name: 'filename',
      type: 'text',
      required: true,
    },
    {
      name: 'metadata',
      type: 'json',
      required: true,
    },
    {
      name: 'order',
      type: 'number',
      required: true,
    },
  ],
}
