import * as React from 'react'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAutoScroll } from '@/components/ui/chat/hooks/useAutoScroll'

interface ChatMessageListProps extends React.HTMLAttributes<HTMLDivElement> {
  smooth?: boolean
}

const ChatMessageList = React.forwardRef<HTMLDivElement, ChatMessageListProps>(
  ({ className, children, smooth = false, ...props }) => {
    const { scrollRef, isAtBottom, scrollToBottom, disableAutoScroll } = useAutoScroll({
      smooth,
      content: children,
    })

    return (
      <div className="relative h-full w-full">
        <div
          className={`hide-scrollbar flex h-full w-full flex-col overflow-y-auto p-6 ${className}`}
          ref={scrollRef}
          onWheel={disableAutoScroll}
          onTouchMove={disableAutoScroll}
          {...props}
        >
          <div className="flex flex-col gap-6">{children}</div>
        </div>

        {!isAtBottom && (
          <Button
            onClick={() => {
              scrollToBottom()
            }}
            size="icon"
            variant="outline"
            className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 transform rounded-full shadow-md"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  },
)

ChatMessageList.displayName = 'ChatMessageList'

export { ChatMessageList }
