'use client'

import React, { useEffect, useState } from 'react'
import Chat, { ChatProps } from './chat'

type MergedProps = ChatProps

export function ChatLayout({ initialMessages, id, selectedModel }: MergedProps) {
  const [, setIsMobile] = useState(false)

  useEffect(() => {
    const checkScreenWidth = () => {
      setIsMobile(window.innerWidth <= 1023)
    }

    // Initial check
    checkScreenWidth()

    // Event listener for screen width changes
    window.addEventListener('resize', checkScreenWidth)

    // Cleanup the event listener on component unmount
    return () => {
      window.removeEventListener('resize', checkScreenWidth)
    }
  }, [])

  return (
    <div className="flex h-full w-full max-w-3xl flex-col">
      <Chat id={id} initialMessages={initialMessages} selectedModel={selectedModel} />
    </div>
  )
}
