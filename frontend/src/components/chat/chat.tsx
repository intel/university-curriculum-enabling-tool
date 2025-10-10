// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import ChatList from './chat-list'
import ChatBottombar from './chat-bottombar'
import { ChatRequestOptions, generateId, DefaultChatTransport } from 'ai'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import useChatStore from '@/lib/store/chat-store'
import { useRouter } from 'next/navigation'
import { useSourcesStore } from '@/lib/store/sources-store'
import { errorToastHandler } from '@/lib/handler/error-toast-handler'
import { UIMessage, useChat } from '@ai-sdk/react'
import { usePersonaStore } from '@/lib/store/persona-store'
import { useCourses } from '@/lib/hooks/use-courses'

export interface ChatProps {
  id: string
  initialMessages: UIMessage[] | []
  selectedModel: string
}

export default function Chat({ initialMessages, id, selectedModel }: ChatProps) {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status, stop, setMessages, regenerate } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
    onFinish: ({ message }) => {
      const savedMessages = getMessagesById(id)
      saveMessages(id, [...savedMessages, message], selectedModel, selectedCourse, selectedSources)
      setLoadingSubmit(false)
      router.replace(`/workspace/chat/${id}`)
    },
    onError: (error) => {
      setLoadingSubmit(false)
      router.replace('/workspace/chat')
      errorToastHandler(error)
    },
  })
  const [loadingSubmit, setLoadingSubmit] = React.useState(false)
  const base64Images = useChatStore((state) => state.base64Images)
  const setBase64Images = useChatStore((state) => state.setBase64Images)
  const saveMessages = useChatStore((state) => state.saveMessages)
  const getMessagesById = useChatStore((state) => state.getMessagesById)
  const router = useRouter()
  const { data: coursesData } = useCourses()
  const [contentHeight, setContentHeight] = useState('calc(100vh - 64px)') // Assuming 64px for header
  const selectedSources = useSourcesStore((state) => state.selectedSources)
  const { activePersona, selectedCourseId, getPersonaLanguage } = usePersonaStore()
  const selectedCourse = coursesData?.docs.find((course) => course.id === selectedCourseId)

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    window.history.replaceState({}, '', `/workspace/chat/${id}`)

    if (!selectedModel) {
      toast.error(`Please select a ${activePersona === 'faculty' ? 'model' : 'course'}.`)
      return
    }

    // Create attachments for images
    const attachments =
      base64Images?.map((b64, i) => {
        const mediaType = b64.match(/^data:([^;]+);base64,/)?.[1] ?? 'image/png'
        return {
          name: `image-${i}.png`,
          contentType: mediaType,
          url: b64,
        }
      }) ?? []

    const messageParts = [{ type: 'text' as const, text: input }]
    const userMessage: UIMessage = {
      id: generateId(),
      role: 'user',
      parts: messageParts,
      ...(attachments.length > 0 && { attachments }),
    }

    setLoadingSubmit(true)

    const requestOptions: ChatRequestOptions = {
      body: {
        selectedModel: selectedModel,
        selectedSources,
        conversationHistory: 'yes',
        language: getPersonaLanguage(activePersona),
      },
      ...(base64Images && {
        data: {
          images: base64Images,
          conversationHistory: 'yes',
        },
      }),
    }

    try {
      sendMessage(userMessage, requestOptions)
      saveMessages(id, [...messages, userMessage], selectedModel, selectedCourse, selectedSources)
      setBase64Images(null)
      setInput('')
    } catch (error) {
      console.error('Error in onSubmit:', error)
      setLoadingSubmit(false)
    }
  }

  const removeLatestMessage = () => {
    const updatedMessages = messages.slice(0, -1)
    setMessages(updatedMessages)
    saveMessages(id, updatedMessages, selectedModel, selectedCourse, selectedSources)
    return updatedMessages
  }

  const handleStop = () => {
    stop()
    saveMessages(id, [...messages], selectedModel, selectedCourse, selectedSources)
    setLoadingSubmit(false)
  }

  const getIsLoadingFromStatus = (status: string) => {
    return status === 'submitted' || status === 'streaming'
  }

  useEffect(() => {
    const updateHeight = () => {
      const headerHeight = 154 // Adjust this value based on your actual header height
      setContentHeight(`calc(100vh - ${headerHeight}px)`)
    }

    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  return (
    <div className="flex flex-col" style={{ height: contentHeight }}>
      <ChatList
        messages={messages}
        isLoading={getIsLoadingFromStatus(status)}
        loadingSubmit={loadingSubmit}
        reload={async (chatRequestOptions?: ChatRequestOptions) => {
          removeLatestMessage()

          const requestOptions: ChatRequestOptions = {
            body: {
              selectedModel: selectedModel,
              language: getPersonaLanguage(activePersona),
            },
            ...chatRequestOptions,
          }

          setLoadingSubmit(true)
          await regenerate(requestOptions)
          return null
        }}
      />
      <ChatBottombar
        input={input}
        handleInputChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
        handleSubmit={onSubmit}
        isLoading={getIsLoadingFromStatus(status)}
        stop={handleStop}
      />
    </div>
  )
}
