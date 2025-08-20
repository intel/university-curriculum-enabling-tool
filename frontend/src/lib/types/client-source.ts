// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

/**
 * Represents a client-side source object.
 *
 * This interface defines the structure of a source object used on the client side.
 * It includes properties for the source's ID, name, type, metadata, and selection state.
 */
export interface ClientSource {
  id: number // Unique identifier for the source
  name: string // Name of the source
  type: string // Type of the source (e.g., text, image)
  metadata: {
    size: number // Size of the source in bytes
    fileSize?: number
    pageCount?: number
    dateUploaded?: string
    [key: string]: unknown
  }
  selected?: boolean // Optional property indicating if the source is selected
}

export interface CriteriaItem {
  /**
   * Name or description of the criteria
   */
  name: string

  /**
   * Weight or points allocated to this criteria
   */
  weight: number
}
