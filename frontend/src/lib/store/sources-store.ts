// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ClientSource } from '@/lib/types/client-source'

// Define the state and actions
interface SourceState {
  sources: ClientSource[] // Stores full source list with selection state
  selectedSources: ClientSource[] // Array of selected source objects

  // Actions
  setSources: (sources: ClientSource[]) => void
  addSource: (source: ClientSource) => void
  deleteSource: (id: number) => void
  renameSource: (id: number, newName: string) => void
  toggleSourceSelection: (id: number, selected: boolean) => void
}

/**
 * Zustand store for managing sources with persistence.
 *
 * This store manages a list of sources and their selection state.
 * It provides actions to set, add, delete, rename, and toggle selection of sources.
 */
export const useSourcesStore = create<SourceState>()(
  persist(
    (set) => ({
      sources: [],
      selectedSources: [],

      /**
       * Sets the list of sources and updates the selected sources.
       *
       * @param sources - An array of sources to set.
       */
      setSources: (sources) =>
        set({
          sources,
          selectedSources: sources.filter((s) => s.selected),
        }),

      /**
       * Adds a new source to the list and updates the selected sources.
       *
       * @param source - The source to add.
       */
      addSource: (source) =>
        set((state) => {
          const newSources = [...state.sources, source]
          return {
            sources: newSources,
            selectedSources: newSources.filter((s) => s.selected),
          }
        }),

      /**
       * Deletes a source by its ID and updates the selected sources.
       *
       * @param id - The ID of the source to delete.
       */
      deleteSource: (id) =>
        set((state) => {
          const newSources = state.sources.filter((s) => s.id !== id)
          return {
            sources: newSources,
            selectedSources: newSources.filter((s) => s.selected),
          }
        }),

      /**
       * Renames a source by its ID and updates the selected sources.
       *
       * @param id - The ID of the source to rename.
       * @param newName - The new name for the source.
       */
      renameSource: (id, newName) =>
        set((state) => {
          const newSources = state.sources.map((s) => (s.id === id ? { ...s, name: newName } : s))
          return {
            sources: newSources,
            selectedSources: newSources.filter((s) => s.selected),
          }
        }),

      /**
       * Toggles the selection state of a source by its ID.
       *
       * @param id - The ID of the source to toggle.
       * @param selected - The new selection state for the source.
       */
      toggleSourceSelection: (id, selected) =>
        set((state) => {
          const newSources = state.sources.map((s) => (s.id === id ? { ...s, selected } : s))
          return {
            sources: newSources,
            selectedSources: newSources.filter((s) => s.selected),
          }
        }),
    }),
    {
      name: 'sources-storage', // Name for the persisted storage
    },
  ),
)
