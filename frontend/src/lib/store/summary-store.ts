// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SummarySession {
  summary: string
  createdAt: string
  selectedModel: string
}

interface State {
  summaries: Record<string, SummarySession>
  currentSummaryId: string | null
  selectedModel: string
  userName: string
  isGenerating: boolean
  error: string | null
}

interface Actions {
  setCurrentSummaryId: (summaryId: string) => void
  setSelectedModel: (selectedModel: string) => void
  getSummaryById: (summaryId: string) => SummarySession | undefined
  setSummary: (summaryId: string, summary: string) => void
  setUserName: (userName: string) => void
  startGenerating: () => void
  stopGenerating: () => void
  setError: (error: string | null) => void
  handleDelete: (summaryId: string) => void
}

const useSummaryStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      summaries: {},
      currentSummaryId: null,
      selectedModel: '',
      userName: 'Anonymous',
      isGenerating: false,
      error: null,

      setUserName: (userName) => set({ userName }),
      setCurrentSummaryId: (summaryId) => set({ currentSummaryId: summaryId }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      getSummaryById: (summaryId) => {
        const state = get()
        return state.summaries[summaryId]
      },
      setSummary: (summaryId, summary) => {
        const state = get()
        const selectedModel = state.selectedModel
        set((state) => ({
          summaries: {
            ...state.summaries,
            [summaryId]: {
              summary,
              createdAt: state.summaries[summaryId]?.createdAt || new Date().toISOString(),
              selectedModel,
            },
          },
        }))
      },
      startGenerating: () => set({ isGenerating: true, error: null }),
      stopGenerating: () => set({ isGenerating: false }),
      setError: (error) => set({ error }),
      handleDelete: (summaryId) =>
        set((state) => {
          const remainingSummaries = { ...state.summaries }
          delete remainingSummaries[summaryId]
          return {
            summaries: remainingSummaries,
          }
        }),
    }),
    {
      name: 'summary-page-state',
      partialize: (state) => ({
        summaries: state.summaries,
        currentSummaryId: state.currentSummaryId,
        // selectedModel: state.selectedModel,
        userName: state.userName,
      }),
    },
  ),
)

export default useSummaryStore
