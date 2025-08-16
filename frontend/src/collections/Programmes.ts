import type { CollectionConfig } from 'payload'

export const Programmes: CollectionConfig = {
  slug: 'programmes',
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
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'courses',
      type: 'relationship',
      relationTo: 'courses',
      hasMany: true,
    },
  ],
}
