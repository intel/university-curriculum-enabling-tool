'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'
import { getContextIcon } from '@/components/context/context-icon'
import {
  getNoContextAvailableTitle,
  getNoContextAvailableDescription,
  getSelectContextTitle,
  getSelectContextDescription,
  getAddContextButtonText,
} from '@/lib/utils/context-messages'
import { Plus } from 'lucide-react'

interface ContextRequirementMessageProps {
  extendedMessage?: string
  className?: string
  height?: string
  children?: ReactNode
}

/**
 * A reusable component that displays appropriate messages when context is missing
 * Can be used in any page that requires a selected context (model or course)
 */
export function ContextRequirementMessage({
  extendedMessage = '',
  className = '',
  height = 'h-[calc(100vh-200px)]',
  children,
}: ContextRequirementMessageProps) {
  const router = useRouter()
  const {
    activePersona,
    hasSelectedContext,
    hasAvailableContext,
    getAddContextPath,
    getContextTypeLabel,
  } = useContextAvailability()

  // If context requirements are met, render children or null
  if (hasAvailableContext && hasSelectedContext) {
    return children || null
  }

  // Get the appropriate icon based on persona
  const contextIcon = getContextIcon(activePersona, 'xl', 0.6)
  const contextType = getContextTypeLabel()

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <div
        className={`flex flex-col items-center justify-center text-center ${height} p-4 ${className}`}
      >
        {/* <div className={`w-full flex flex-col items-center justify-center ${height} ${className}`}>
      <div className="text-center max-w-md"> */}
        {!hasAvailableContext ? (
          // No models/courses available
          <>
            <div className="mb-2 text-primary">{contextIcon}</div>
            <h2 className="mb-2 text-2xl font-bold">{getNoContextAvailableTitle(contextType)}</h2>
            <p className="mb-6 max-w-xs text-sm text-muted-foreground">
              {getNoContextAvailableDescription(contextType, extendedMessage)}
            </p>
            <Button onClick={() => router.push(getAddContextPath())} className="mb-4">
              <Plus className="h-4 w-4" />
              {getAddContextButtonText(contextType)}
            </Button>
          </>
        ) : (
          // Has models/courses but none selected
          <>
            <div className="mb-2 h-28 w-28 text-primary">{contextIcon}</div>
            <h2 className="mb-2 text-2xl font-bold">{getSelectContextTitle(contextType)}</h2>
            <p className="mb-6 max-w-xs text-sm text-muted-foreground">
              {getSelectContextDescription(contextType, extendedMessage)}
            </p>
          </>
        )}

        {/* Show the context switcher hint */}
        {hasAvailableContext && (
          <div className="relative">
            <Card className="border-2 border-dashed border-primary/50 bg-primary/5">
              <CardHeader>
                <CardTitle className="mb-2 text-left font-medium">
                  How to select a {contextType}
                </CardTitle>
                <CardDescription>
                  <ol className="list-inside list-decimal space-y-2 text-left">
                    <li>Click on the context switcher in the top left corner of the sidebar</li>
                    <li>Select a {contextType} from the dropdown menu</li>
                  </ol>
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
