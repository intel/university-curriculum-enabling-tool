'use client'
import { CheckIcon, CopyIcon } from '@radix-ui/react-icons'
import React, { useMemo, useRef, useState } from 'react'
import { CodeBlock, dracula, github } from 'react-code-blocks'
import { Button } from './ui/button'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'

interface ButtonCodeblockProps {
  code: string
}

export default function CodeDisplayBlock({ code }: ButtonCodeblockProps) {
  const [isCopied, setIsCopied] = useState(false)
  const isCopiedRef = useRef(false)
  const { theme } = useTheme()

  const filteredCode = useMemo(() => code.split('\n').slice(1).join('\n') || code, [code])
  const trimmedCode = useMemo(() => filteredCode.trim(), [filteredCode])
  const language = useMemo(
    () =>
      ['tsx', 'js', 'python', 'css', 'html', 'cs'].includes(code.split('\n')[0])
        ? code.split('\n')[0]
        : 'tsx',
    [code],
  )

  const customStyle = useMemo(
    () => (theme === 'dark' ? { background: '#303033' } : { background: '#fcfcfc' }),
    [theme],
  )

  const codeTheme = useMemo(() => (theme === 'dark' ? dracula : github), [theme])

  const copyToClipboard = () => {
    if (isCopiedRef.current) return // Prevent multiple triggers
    navigator.clipboard.writeText(trimmedCode)
    isCopiedRef.current = true
    setIsCopied(true)
    toast.success('Code copied to clipboard!')

    setTimeout(() => {
      isCopiedRef.current = false
      setIsCopied(false)
    }, 1500)
  }

  return (
    <div className="relative mx-auto my-4 flex w-[215px] flex-col overflow-x-auto text-sm sm:w-[460px] md:w-[380px] lg:w-[570px] xl:w-full 2xl:w-full">
      <Button
        onClick={copyToClipboard}
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-5 w-5"
      >
        {isCopied ? (
          <CheckIcon className="h-4 w-4 scale-100 transition-all" />
        ) : (
          <CopyIcon className="h-4 w-4 scale-100 transition-all" />
        )}
      </Button>
      <CodeBlock
        customStyle={customStyle}
        text={trimmedCode}
        language={language}
        showLineNumbers={false}
        theme={codeTheme}
      />
    </div>
  )
}
