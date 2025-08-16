import React, { memo, useMemo, useState } from 'react'
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
import { Message } from '@ai-sdk/react'
import { toast } from 'sonner'

export type ChatMessageProps = {
  message: Message
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
  const [isCopied] = useState<boolean>(false)

  // Extract "think" content from Deepseek R1 models and clean message (rest) content
  const { thinkContent, cleanContent } = useMemo(() => {
    const getThinkContent = (content: string) => {
      const match = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/)
      return match ? match[1].trim() : null
    }

    return {
      thinkContent: message.role === 'assistant' ? getThinkContent(message.content) : null,
      cleanContent: message.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim(),
    }
  }, [message.content, message.role])

  const contentParts = useMemo(() => cleanContent.split('```'), [cleanContent])

  const handleCopy = async () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(message.content)
        toast.success('Chat message copied to clipboard', {
          description: 'Use ctrl + v to paste it',
        })
      } catch (err) {
        console.error('Failed to copy text: ', err)
      }
    } else {
      // Fallback method
      const textarea = document.createElement('textarea')
      textarea.value = message.content
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        toast.success('Chat message copied to clipboard', {
          description: 'Use ctrl + v to paste it',
        })
      } catch (err) {
        console.error('Failed to copy text: ', err)
      }
      document.body.removeChild(textarea)
    }
  }

  const renderAttachments = () => (
    <div className="flex gap-2">
      {message.experimental_attachments
        ?.filter((attachment) => attachment.contentType?.startsWith('image/'))
        .map((attachment, index) => (
          <Image
            key={`${message.id}-${index}`}
            src={attachment.url}
            width={200}
            height={200}
            alt="attached image"
            className="rounded-md object-contain"
          />
        ))}
    </div>
  )

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

  const renderContent = () =>
    contentParts.map((part, index) =>
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

export default memo(ChatMessage, (prevProps, nextProps) => {
  if (nextProps.isLast) return false
  return prevProps.isLast === nextProps.isLast && prevProps.message === nextProps.message
})
