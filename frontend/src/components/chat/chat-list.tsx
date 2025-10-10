// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import ChatMessage from './chat-message'
import { ChatMessageList } from '../ui/chat/chat-message-list'
import { ChatBubble, ChatBubbleMessage } from '../ui/chat/chat-bubble'
import { ChatRequestOptions } from 'ai'
import { GraduationCap } from 'lucide-react'
import { UIMessage } from '@ai-sdk/react'

interface ChatListProps {
  messages: UIMessage[]
  isLoading: boolean
  loadingSubmit?: boolean
  reload: (chatRequestOptions?: ChatRequestOptions) => Promise<string | null | undefined>
}

export default function ChatList({ messages, isLoading, loadingSubmit, reload }: ChatListProps) {
  return (
    <div className="w-full flex-1 overflow-y-auto">
      <ChatMessageList>
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id || index}
            message={message}
            isLast={index === messages.length - 1}
            isLoading={isLoading}
            reload={reload}
            canRegenerate={index !== 0}
          />
        ))}
        {loadingSubmit && (
          <ChatBubble variant="received">
            <GraduationCap strokeWidth={0.8} className="h-8 min-w-8 text-primary" />
            <ChatBubbleMessage isLoading />
          </ChatBubble>
        )}
      </ChatMessageList>
    </div>
  )
}
