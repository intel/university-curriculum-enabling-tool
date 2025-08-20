// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { OllamaModel } from '../types/ollama-model'

interface ModelStore {
  models: OllamaModel[]
  selectedModel: string | ''
  setModels: (models: OllamaModel[]) => void
  setSelectedModel: (modelName: string) => void
  addModel: (model: OllamaModel) => void
  deleteModel: (name: string) => void
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      models: [],
      selectedModel: '',
      setModels: (models) => set({ models }),
      setSelectedModel: (modelName) => set({ selectedModel: modelName }),
      addModel: (model) => set((state) => ({ models: [...state.models, model] })),
      /**
       * Deletes a source by its ID and updates the selected sources.
       *
       * @param name - The name of the model to delete.
       */
      deleteModel: (modelName) =>
        set((state) => ({
          models: state.models.filter((m) => m.name !== modelName),
          selectedModel: state.selectedModel === modelName ? '' : state.selectedModel,
        })),
    }),
    {
      name: 'model-storage',
    },
  ),
)
