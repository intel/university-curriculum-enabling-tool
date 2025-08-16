import * as React from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type ChatInputProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
  ({ className, ...props }, forwardedRef) => {
    const handleRef = (node: HTMLTextAreaElement | null) => {
      if (node) {
        // Apply auto-resize logic
        node.style.height = '0px'
        node.style.height = node.scrollHeight + 'px'

        if (typeof forwardedRef === 'function') {
          forwardedRef(node)
        } else if (forwardedRef) {
          forwardedRef.current = node
        }
      }
    }

    return (
      <Textarea
        autoComplete="off"
        ref={handleRef}
        name="message"
        className={cn(
          'flex h-16 min-h-16 w-full items-center rounded-md px-4 py-3 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)

ChatInput.displayName = 'ChatInput'

export { ChatInput }
