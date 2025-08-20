// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useRouter } from 'next/navigation'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import useChatStore from '@/lib/store/chat-store'
import { Search, MoreVertical, Trash2, Trash, MessageSquarePlus, MessageSquare } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useEffect, useState } from 'react'
import { formatDateByGroup } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { usePersonaStore } from '@/lib/store/persona-store'
import { Badge } from '@/components/ui/badge'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'
import { getSelectContextDescription } from '@/lib/utils/context-messages'

export default function ChatHistoryPage() {
  const [, setIsMobile] = useState(false)
  const { activePersona } = usePersonaStore()
  const { getActiveContextModelName, getContextTypeLabel } = useContextAvailability()
  const modelName = getActiveContextModelName()

  const router = useRouter()
  const chats = useChatStore((state) => state.chats)
  const handleDelete = useChatStore((state) => state.handleDelete)
  const [searchTerm, setSearchTerm] = useState('')
  const [listHeight, setListHeight] = useState('calc(100vh - 400px)')

  const chatArray = Object.keys(chats).map((key) => ({
    id: key,
    ...chats[key],
  }))

  const filteredChats = chatArray.filter((chat) =>
    chat.messages.some((message) =>
      message.content.toLowerCase().includes(searchTerm.toLowerCase()),
    ),
  )

  const handleBulkDelete = () => {
    filteredChats.forEach((chat) => handleDelete(chat.id))
  }

  useEffect(() => {
    const checkScreenWidth = () => {
      setIsMobile(window.innerWidth <= 1023)
    }

    checkScreenWidth()

    window.addEventListener('resize', checkScreenWidth)

    const updateHeight = () => {
      const headerHeight = 64
      const searchBarHeight = 40
      const paddingHeight = 48
      const newChatHeight = 100
      const availableHeight =
        window.innerHeight - (headerHeight + searchBarHeight + paddingHeight + newChatHeight)
      setListHeight(`${availableHeight}px`)
    }

    updateHeight()
    window.addEventListener('resize', updateHeight)

    return () => {
      window.removeEventListener('resize', checkScreenWidth)
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  return (
    <div className="min-w-3xl w-full max-w-3xl space-y-2 pb-20 pl-4 pr-4">
      <div className="space-y-0 pt-6">
        <div className="mb-4 flex items-center justify-start">
          <h1 className="text-lg font-bold">Chat History</h1>
          <div className="w-8"></div>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="flex items-center justify-between">
          <CardDescription>
            Total chats: {filteredChats.filter((c) => c.persona === activePersona).length}
          </CardDescription>
          <div className="flex space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (modelName) {
                  router.push('/workspace/chat')
                } else {
                  toast.error(
                    `${getSelectContextDescription(getContextTypeLabel(), 'before starting a conversation.')}`,
                  )
                }
              }}
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Trash className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete all chats in the
                    current list.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDelete}>Delete All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="hide-scrollbar space-y-2 overflow-auto pb-4" style={{ height: listHeight }}>
          {filteredChats.filter((c) => c.persona === activePersona).length > 0 ? (
            filteredChats
              .filter((c) => c.persona === activePersona)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((chat) => (
                <Card
                  key={chat.id}
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => router.push(`/workspace/chat/${chat.id}`)}
                >
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-normal">
                        {activePersona === 'faculty' ? (
                          <div className="truncate">
                            <div className="mb-1 flex max-w-[280px] items-center gap-2 truncate font-medium">
                              <Badge variant="outline" className="text-xs">
                                {chat.messages[0]?.model ? chat.messages[0].model : 'Error'}
                              </Badge>
                            </div>
                          </div>
                        ) : (
                          <div className="truncate">
                            <div className="mb-1 flex items-center gap-2 font-medium">
                              <Badge variant="outline" className="text-xs">
                                <div className="max-w-[220px] truncate">
                                  {chat.messages[0]?.selectedCourse?.name}
                                </div>
                              </Badge>
                            </div>
                          </div>
                        )}
                      </CardTitle>
                      <CardDescription className="ml-2 max-w-[240px] truncate text-sm">
                        {chat.messages[1].content}
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CardDescription className="text-xs">
                        {formatDateByGroup(new Date(chat.createdAt))}
                      </CardDescription>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <div
                            onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                              }
                            }}
                          >
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                  onClick={(e: React.MouseEvent<HTMLDivElement>) =>
                                    e.stopPropagation()
                                  }
                                  onSelect={(e) => {
                                    e.preventDefault()
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  <span>Delete</span>
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the
                                    chat.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel
                                    onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
                                      e.stopPropagation()
                                    }
                                  >
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                      handleDelete(chat.id)
                                      e.stopPropagation()
                                    }}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                </Card>
              ))
          ) : (
            <div className="flex h-full flex-col items-center justify-center py-8 text-center">
              <MessageSquare strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
              <h3 className="mb-2 text-2xl font-bold">No chat history yet</h3>
              <p className="mb-6 max-w-xs text-sm text-muted-foreground">
                {`Start a new conversation to begin your academic journey`}
              </p>
              <Button
                onClick={() => {
                  if (modelName) {
                    router.push('/workspace/chat')
                  } else {
                    toast.error(
                      `${getSelectContextDescription(getContextTypeLabel(), 'before starting a conversation.')}`,
                    )
                  }
                }}
                className="flex items-center gap-2"
              >
                <MessageSquarePlus className="h-4 w-4" />
                <span>Start New Chat</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
