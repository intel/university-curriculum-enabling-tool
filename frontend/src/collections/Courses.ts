// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { CollectionConfig } from 'payload'

export const Courses: CollectionConfig = {
  slug: 'courses',
  access: {
    read: () => true,
    delete: () => true,
    update: () => true,
    create: () => true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'code',
      type: 'text',
      required: true,
    },
    {
      name: 'facultyName',
      type: 'text',
      required: true,
    },
    {
      name: 'version',
      type: 'text',
      required: true,
      defaultValue: '2025.01.0',
    },
    {
      name: 'tag',
      type: 'text',
      required: false,
      defaultValue: 'default',
      validate: (value: unknown) => {
        if (typeof value !== 'string') return 'Tag must be a string.'
        if (!/^[a-z0-9]+$/.test(value)) {
          return 'Tag must contain only lowercase alphanumeric characters (no spaces or symbols).'
        }
        return true
      },
      hooks: {
        beforeChange: [
          ({ value }) => {
            if (typeof value === 'string') {
              // Sanitize: remove non-alphanumeric, convert to lowercase
              return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
            }
            return value
          },
        ],
      },
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'model',
      type: 'json',
    },
  ],
}
