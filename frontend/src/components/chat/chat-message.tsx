// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import React, { memo, useMemo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatRequestOptions } from 'ai'
import { CheckIcon, CopyIcon } from '@radix-ui/react-icons'
import { GraduationCap, RefreshCcw } from 'lucide-react'
import Image from 'next/image'
import { ChatBubble, ChatBubbleMessage } from '../ui/chat/chat-bubble'
import ButtonWithTooltip from '../button-with-tooltip'
import { Button } from '../ui/button'
import CodeDisplayBlock from '../code-display-block'
import { UIMessage } from '@ai-sdk/react'
import { toast } from 'sonner'
import { extractTextFromMessage } from '@/lib/utils/message'

export type ChatMessageProps = {
  message: UIMessage
  isLast: boolean
  isLoading: boolean | undefined
  reload: (chatRequestOptions?: ChatRequestOptions) => Promise<string | null | undefined>
  canRegenerate?: boolean
}

const MOTION_CONFIG = {
  initial: { opacity: 0, scale: 1, y: 20, x: 0 },
  animate: { opacity: 1, scale: 1, y: 0, x: 0 },
  exit: { opacity: 0, scale: 1, y: 20, x: 0 },
  transition: {
    opacity: { duration: 0.1 },
    layout: {
      type: 'spring' as const,
      bounce: 0.3,
      duration: 0.2,
    },
  },
}

function ChatMessage({
  message,
  isLast,
  isLoading,
  reload,
  canRegenerate = true,
}: ChatMessageProps) {
  const [isCopied, setIsCopied] = useState<boolean>(false)

  // messageRecord for typed access
  const messageRecord = message as unknown as Record<string, unknown>

  // Extract "think" content from Deepseek R1 models and clean message (rest) content
  const { thinkContent, cleanContent, rawText } = useMemo(() => {
    const getThinkContent = (content: string): string | null => {
      const match = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/)
      return match ? match[1].trim() : null
    }

    // Prefer v5 parts extraction, fall back to legacy message.content
    const raw = extractTextFromMessage(message) || (messageRecord.content as string) || ''

    return {
      thinkContent: message.role === 'assistant' ? getThinkContent(raw) : null,
      cleanContent: raw.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim(),
      rawText: raw,
    }
  }, [message, messageRecord.content])

  const contentParts = useMemo(() => cleanContent.split('```'), [cleanContent])

  const handleCopy = async (): Promise<void> => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(rawText || '')
        setIsCopied(true)
        toast.success('Chat message copied to clipboard', {
          description: 'Use ctrl + v to paste it',
        })
        setTimeout(() => setIsCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy text: ', err)
      }
    } else {
      // Fallback method
      const textarea = document.createElement('textarea')
      textarea.value = rawText || ''
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        setIsCopied(true)
        toast.success('Chat message copied to clipboard', {
          description: 'Use ctrl + v to paste it',
        })
        setTimeout(() => setIsCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy text: ', err)
      }
      document.body.removeChild(textarea)
    }
  }

  /* Normalize attachments from v5 message.parts or legacy experimental_attachments.
     - SSR-safe: avoid creating blob URLs during server render.
     - Creates blob URLs for inline/base64 data and revokes them on cleanup. */
  type NormalizedAttachment = {
    url?: string
    contentType?: string
    name?: string
    blobUrl?: string
  }

  type Part = {
    type?: string
    mime?: string
    contentType?: string
    url?: string
    name?: string
    filename?: string
    data?: string
    body?: string
  }

  // Helper: convert data URL to Blob (browser only)
  function dataURLToBlob(dataUrl: string): Blob {
    const [meta, data] = dataUrl.split(',')
    const mimeMatch = meta?.match(/:(.*?);/)
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
    const binary = atob(data)
    const len = binary.length
    const u8 = new Uint8Array(len)
    for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i)
    return new Blob([u8], { type: mime })
  }

  const attachments = useMemo<NormalizedAttachment[]>(() => {
    // Avoid blob creation on server
    if (typeof window === 'undefined') return []

    const out: NormalizedAttachment[] = []
    const parts = (message as unknown as { parts?: Part[] }).parts

    if (Array.isArray(parts)) {
      for (const part of parts) {
        // common part shapes: { type: 'file', mime, url, name, filename, data }
        const mime = part.mime || part.contentType || undefined
        const url = part.url
        const name = part.name || part.filename
        const data = part.data || part.body

        const isFilePart = part.type === 'file' || !!url || !!data
        if (!isFilePart) continue

        const att: NormalizedAttachment = { url, contentType: mime, name }

        // Inline/base64 data -> create blob URL
        if (!att.url && typeof data === 'string') {
          try {
            const dataUrl = data.startsWith('data:')
              ? data
              : `data:${mime || 'application/octet-stream'};base64,${data}`
            const blob = dataURLToBlob(dataUrl)
            att.blobUrl = URL.createObjectURL(blob)
          } catch {
            // ignore invalid data
          }
        }

        out.push(att)
      }
    }

    return out
  }, [message])

  // Cleanup any created blob URLs when the message changes/unmount
  useEffect(() => {
    return () => {
      for (const a of attachments) {
        if (a.blobUrl) {
          try {
            URL.revokeObjectURL(a.blobUrl)
          } catch {
            // ignore
          }
        }
      }
    }
  }, [attachments])

  const renderAttachments = (): React.ReactNode => {
    if (!attachments || attachments.length === 0) return null

    return (
      <div className="flex gap-2">
        {attachments
          .filter((attachment: NormalizedAttachment) =>
            attachment.contentType?.startsWith?.('image/'),
          )
          .map((attachment: NormalizedAttachment, index: number) => (
            <Image
              key={`${message.id}-${index}`}
              src={attachment.url ?? attachment.blobUrl ?? ''}
              width={200}
              height={200}
              alt={attachment.name ?? 'attached image'}
              className="rounded-md object-contain"
            />
          ))}
      </div>
    )
  }

  const renderThinkingProcess = () =>
    thinkContent &&
    message.role === 'assistant' && (
      <details className="mb-2 text-xs" open>
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Thinking process
        </summary>
        <div className="mt-2 text-xs text-muted-foreground">
          <Markdown remarkPlugins={[remarkGfm]}>{thinkContent}</Markdown>
        </div>
      </details>
    )

  const renderContent = (): React.ReactNode =>
    contentParts.map((part: string, index: number) =>
      index % 2 === 0 ? (
        <div className="text-sm" key={index}>
          <Markdown className="markdown-content" key={index} remarkPlugins={[remarkGfm]}>
            {part}
          </Markdown>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap text-xs" key={index}>
          <CodeDisplayBlock code={part} />
        </pre>
      ),
    )

  const renderActionButtons = () =>
    message.role === 'assistant' && (
      <div className="flex items-center gap-1 pt-2 text-muted-foreground">
        {!isLoading && (
          <ButtonWithTooltip side="bottom" toolTipText="Copy">
            <Button onClick={handleCopy} variant="ghost" size="icon" className="h-4 w-4">
              {isCopied ? (
                <CheckIcon className="h-3.5 w-3.5 transition-all" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5 transition-all" />
              )}
            </Button>
          </ButtonWithTooltip>
        )}
        {!isLoading && isLast && canRegenerate && (
          <ButtonWithTooltip side="bottom" toolTipText="Regenerate">
            <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => reload()}>
              <RefreshCcw className="h-3.5 w-3.5 scale-100 transition-all" />
            </Button>
          </ButtonWithTooltip>
        )}
      </div>
    )

  return (
    <motion.div {...MOTION_CONFIG} className="flex flex-col gap-2 whitespace-pre-wrap">
      <ChatBubble variant={message.role === 'user' ? 'sent' : 'received'}>
        {message.role === 'assistant' ? (
          <GraduationCap strokeWidth={0.8} className="h-8 min-w-8 text-primary" />
        ) : null}

        <ChatBubbleMessage>
          {renderThinkingProcess()}
          {renderAttachments()}
          {renderContent()}
          {renderActionButtons()}
        </ChatBubbleMessage>
      </ChatBubble>
    </motion.div>
  )
}

export default memo(ChatMessage, (prevProps: ChatMessageProps, nextProps: ChatMessageProps) => {
  if (nextProps.isLast) return false
  return prevProps.isLast === nextProps.isLast && prevProps.message === nextProps.message
})
