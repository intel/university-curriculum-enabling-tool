// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { CollectionConfig } from 'payload'

export const Embeddings: CollectionConfig = {
  slug: 'embeddings',
  access: {
    read: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'source',
      type: 'relationship',
      relationTo: 'sources',
      required: true,
    },
    {
      name: 'chunk',
      type: 'relationship',
      relationTo: 'chunks',
      required: false,
    },
    {
      name: 'media',
      type: 'relationship',
      relationTo: 'media',
      required: false,
    },
    {
      name: 'embeddingType',
      type: 'select',
      options: [
        { label: 'Text', value: 'text' },
        { label: 'Image', value: 'image' },
      ],
      required: true,
    },
    {
      name: 'embedding',
      type: 'json',
      required: true,
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation }) => {
        if (operation === 'create' || operation === 'update') {
          if (data.embeddingType === 'text') {
            if (!data.chunk) {
              throw new Error('For "text" embeddings, the "chunk" field must be provided.')
            }
          } else if (data.embeddingType === 'image') {
            if (!data.media) {
              throw new Error('For "image" embeddings, the "media" field must be provided.')
            }
          } else {
            throw new Error('embeddingType must be either "text" or "image".')
          }
        }
      },
    ],
  },
}
