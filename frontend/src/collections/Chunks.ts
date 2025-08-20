// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { CollectionConfig } from 'payload'

export const Chunks: CollectionConfig = {
  slug: 'chunks',
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
      type: 'code',
      required: true,
    },
    {
      name: 'order',
      type: 'number',
      required: true,
    },
  ],
}
