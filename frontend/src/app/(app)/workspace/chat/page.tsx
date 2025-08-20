// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { History } from 'lucide-react'
import { generateUUID } from '@/lib/utils'
import Chat from '@/components/chat/chat'
import { useEffect, useState } from 'react'
import { ContextRequirementMessage } from '@/components/context-requirement-message'
import { Message } from '@ai-sdk/react'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'
import { usePersonaStore } from '@/lib/store/persona-store'

export default function ChatPage() {
  const id = generateUUID()
  const [, setIsMobile] = useState(false)
  const router = useRouter()
  const { getActiveContextModelName } = useContextAvailability()
  const { activePersona, personas } = usePersonaStore()

  // get model name based on selected model or course
  const modelName = getActiveContextModelName()

  useEffect(() => {
    const checkScreenWidth = () => {
      setIsMobile(window.innerWidth <= 1023)
    }

    checkScreenWidth()

    window.addEventListener('resize', checkScreenWidth)

    return () => {
      window.removeEventListener('resize', checkScreenWidth)
    }
  }, [])

  const activePersonaName = activePersona
    ? personas.find((persona) => persona.id === activePersona)?.name
    : 'Academic Assistant'

  const welcomeMessage: Message[] = [
    {
      id: 'welcome-1',
      role: 'assistant',
      content: `Hello! I'm your AI ${activePersonaName}. ` + `How can I help you today? `,
      createdAt: new Date(),
    },
  ]

  return (
    <ContextRequirementMessage
      height="h-[calc(100vh-200px)]"
      extendedMessage="before starting a new conversation."
    >
      <div className="w-full max-w-3xl space-y-0 pt-6">
        <div className="flex items-center justify-between px-4">
          <h1 className="text-lg font-bold">Chat Assistant</h1>
          <Button
            variant="outline"
            onClick={() => router.push('/workspace/chat/history')}
            className="flex items-center gap-2"
          >
            <History className="h-4 w-4" />
            <span>History</span>
          </Button>
        </div>

        <Card className="w-full border-none shadow-none">
          <CardContent className="p-0">
            <Chat id={id} initialMessages={welcomeMessage} selectedModel={modelName} />
          </CardContent>
        </Card>
      </div>
    </ContextRequirementMessage>
  )
}
