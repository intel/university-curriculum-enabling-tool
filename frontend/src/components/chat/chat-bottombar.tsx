// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import React, { useEffect } from 'react'
import { Button } from '../ui/button'
import { AnimatePresence } from 'framer-motion'
import { Cross2Icon, StopIcon } from '@radix-ui/react-icons'
import { SendHorizonal } from 'lucide-react'
import MultiImagePicker from '../image-embedder'
import useChatStore from '@/lib/store/chat-store'
import Image from 'next/image'
import { ChatRequestOptions } from 'ai'
import { ChatInput } from '../ui/chat/chat-input'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'

interface ChatBottombarProps {
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (
    e: React.FormEvent<HTMLFormElement>,
    chatRequestOptions?: ChatRequestOptions,
  ) => void
  isLoading: boolean
  stop: () => void
  input: string
}

export default function ChatBottombar({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  stop,
}: ChatBottombarProps) {
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const base64Images = useChatStore((state) => state.base64Images)
  const setBase64Images = useChatStore((state) => state.setBase64Images)
  const { getActiveContextModelName } = useContextAvailability()
  const modelName = getActiveContextModelName()

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>)
    }
  }

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [inputRef])

  return (
    <div className="relative flex w-full items-center justify-between px-4 pb-7">
      <AnimatePresence initial={false}>
        <form
          onSubmit={handleSubmit}
          className="flex w-full flex-col items-center rounded-lg bg-secondary"
        >
          <ChatInput
            value={input}
            ref={inputRef}
            onKeyDown={handleKeyPress}
            onChange={handleInputChange}
            name="message"
            placeholder={'Enter your prompt here'}
            className="max-h-40 rounded-lg border-0 bg-accent px-6 pt-6 text-sm shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed"
            disabled={!modelName}
          />

          <div className="flex w-full items-center p-2">
            {isLoading ? (
              // Loading state
              <div className="flex w-full justify-between">
                <MultiImagePicker disabled onImagesPick={setBase64Images} />
                <div>
                  <Button
                    className="shrink-0 rounded-full"
                    variant="ghost"
                    size="icon"
                    type="submit"
                    onClick={(e) => {
                      e.preventDefault()
                      stop()
                    }}
                  >
                    <StopIcon className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            ) : (
              // Default state
              <div className="flex w-full justify-between">
                <MultiImagePicker disabled={isLoading} onImagesPick={setBase64Images} />
                <div>
                  {/* Send button */}
                  <Button
                    className="shrink-0 rounded-full"
                    variant="ghost"
                    size="icon"
                    type="submit"
                    disabled={isLoading || !input.trim() || !modelName}
                  >
                    <SendHorizonal className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          {base64Images && (
            <div className="flex w-full gap-2 px-2 pb-2">
              {base64Images.map((image, index) => {
                // Whitelist src: only allow data URLs for images of specific types (SVG forbidden)
                if (typeof image !== 'string') {
                  console.warn('Rejected image (not a string):', image)
                  return null
                }
                const isSafe = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(image)
                if (!isSafe) {
                  // Log or alert on rejected images for further analysis
                  console.warn(
                    'Rejected image (not allowed type or malformed):',
                    String(image).slice(0, 100),
                  )
                  return null
                }
                return (
                  <div
                    key={index}
                    className="relative flex w-fit flex-col gap-2 rounded-md border-x border-t bg-muted-foreground/20 p-1"
                  >
                    <div className="flex text-sm">
                      <Image
                        src={String(image)}
                        width={20}
                        height={20}
                        className="h-auto max-h-[100px] w-auto max-w-[100px] rounded-md"
                        alt={''}
                      />
                    </div>
                    <Button
                      onClick={() => {
                        const updatedImages = (prevImages: string[]) =>
                          prevImages.filter((_, i) => i !== index)
                        setBase64Images(updatedImages(base64Images))
                      }}
                      size="icon"
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                    >
                      <Cross2Icon className="h-3 w-3" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </form>
      </AnimatePresence>
    </div>
  )
}
