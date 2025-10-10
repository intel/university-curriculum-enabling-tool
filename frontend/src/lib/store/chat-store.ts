// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ClientSource } from '../types/client-source'
import { UIMessage } from '@ai-sdk/react'
import { usePersonaStore } from '@/lib/store/persona-store'
import { Course } from '@/payload-types'

interface ExtendedMessage extends UIMessage {
  model?: string
  selectedCourse?: Course
  selectedSources?: ClientSource[]
}

interface ChatSession {
  messages: ExtendedMessage[]
  createdAt: string
  persona: string | null
  selectedSources?: ClientSource[]
}

interface State {
  base64Images: string[] | null
  chats: Record<string, ChatSession>
  currentChatId: string | null
  selectedModel: string | ''
  userName: string | 'Anonymous'
  isDownloading: boolean
  downloadProgress: number
  downloadingModel: string | null
}

interface Actions {
  setBase64Images: (base64Images: string[] | null) => void
  setCurrentChatId: (chatId: string) => void
  setSelectedModel: (selectedModel: string) => void
  getChatById: (chatId: string) => ChatSession | undefined
  getMessagesById: (chatId: string) => ExtendedMessage[]
  saveMessages: (
    chatId: string,
    messages: UIMessage[],
    model: string,
    selectedCourse: Course | undefined,
    selectedSources: ClientSource[],
  ) => void
  handleDelete: (chatId: string, messageId?: string) => void
  setUserName: (userName: string) => void
  startDownload: (modelName: string) => void
  stopDownload: () => void
  setDownloadProgress: (progress: number) => void
}

const useChatStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      base64Images: null,
      chats: {},
      currentChatId: null,
      selectedModel: '',
      userName: 'Anonymous',
      isDownloading: false,
      downloadProgress: 0,
      downloadingModel: null,

      setBase64Images: (base64Images) => set({ base64Images }),
      setUserName: (userName) => set({ userName }),

      setCurrentChatId: (chatId) => set({ currentChatId: chatId }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      getChatById: (chatId) => {
        const state = get()
        return state.chats[chatId]
      },
      getMessagesById: (chatId) => {
        const state = get()
        return state.chats[chatId]?.messages || []
      },
      saveMessages: (chatId, newMessages, model, selectedCourse, selectedSources) => {
        set((state) => {
          const existingChat = state.chats[chatId]
          const existingMessages = existingChat?.messages || []

          // Merge existing messages with new messages, appending model only to assistant messages
          const mergedMessages = newMessages.map((newMessage) => {
            const existingMessage = existingMessages.find((message) => message.id === newMessage.id)
            if (existingMessage) {
              return existingMessage
            }
            return newMessage.role === 'assistant'
              ? { ...newMessage, model, selectedCourse, selectedSources }
              : newMessage
          })

          return {
            chats: {
              ...state.chats,
              [chatId]: {
                messages: mergedMessages,
                createdAt: existingChat?.createdAt || new Date().toISOString(),
                persona: usePersonaStore.getState().activePersona,
                selectedSources,
              },
            },
          }
        })
      },
      handleDelete: (chatId, messageId) => {
        set((state) => {
          const chat = state.chats[chatId]
          if (!chat) return state

          // If messageId is provided, delete specific message
          if (messageId) {
            const updatedMessages = chat.messages.filter((message) => message.id !== messageId)
            return {
              chats: {
                ...state.chats,
                [chatId]: {
                  ...chat,
                  messages: updatedMessages,
                },
              },
            }
          }

          // If no messageId, delete the entire chat
          const remainingChats = { ...state.chats }
          delete remainingChats[chatId]
          return {
            chats: remainingChats,
          }
        })
      },

      startDownload: (modelName) =>
        set({ isDownloading: true, downloadingModel: modelName, downloadProgress: 0 }),
      stopDownload: () =>
        set({ isDownloading: false, downloadingModel: null, downloadProgress: 0 }),
      setDownloadProgress: (progress) => set({ downloadProgress: progress }),
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        chats: state.chats,
        currentChatId: state.currentChatId,
        selectedModel: state.selectedModel,
        userName: state.userName,
      }),
    },
  ),
)

export default useChatStore
