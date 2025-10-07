import * as React from 'react'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAutoScroll } from '@/components/ui/chat/hooks/useAutoScroll'

interface ChatMessageListProps extends React.HTMLAttributes<HTMLDivElement> {
  smooth?: boolean
}

const ChatMessageList = React.forwardRef<HTMLDivElement, ChatMessageListProps>(
  ({ className, children, smooth = false, ...props }, ref) => {
    const { scrollRef, isAtBottom, scrollToBottom, disableAutoScroll } = useAutoScroll({
      smooth,
      content: children,
    })

    // Robust type guard for mutable refs to avoid type assertions
    const isMutableRefObject = <T,>(r: unknown): r is React.MutableRefObject<T> => {
      return r != null && typeof r === 'object' && 'current' in r
    }

    // Merge forwarded ref with internal scrollRef so parents can access the scrollable element
    const setMergedRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        // Assign to internal scrollRef
        if (isMutableRefObject<HTMLDivElement | null>(scrollRef)) {
          scrollRef.current = node
        }

        // Assign to forwarded ref (function or object ref)
        if (typeof ref === 'function') {
          ref(node)
        } else if (isMutableRefObject<HTMLDivElement | null>(ref)) {
          ref.current = node
        }
      },
      [scrollRef, ref],
    )

    return (
      <div className="relative h-full w-full">
        <div
          className={`hide-scrollbar flex h-full w-full flex-col overflow-y-auto p-6 ${className}`}
          ref={setMergedRef}
          onWheel={disableAutoScroll}
          onTouchMove={disableAutoScroll}
          {...props}
        >
          <div className="flex flex-col gap-6">{children}</div>
        </div>

        {!isAtBottom && (
          <Button
            onClick={scrollToBottom}
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
