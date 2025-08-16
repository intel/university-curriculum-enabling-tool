'use client'

import { useEffect } from 'react'
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Dialog,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form'
import useChatStore from '@/lib/store/chat-store'
import { useModels } from '@/lib/hooks/use-models'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { throttle } from 'lodash'
import { Info, Loader2 } from 'lucide-react'

interface ModelDownloaderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const formSchema = z.object({
  name: z.string().min(1, {
    message: 'Please select a model to download',
  }),
})

export function ModelDownloader({ open, onOpenChange }: ModelDownloaderProps) {
  // const { addModel } = useModelStore()

  const {
    isDownloading,
    downloadProgress,
    downloadingModel,
    startDownload,
    stopDownload,
    setDownloadProgress,
  } = useChatStore()

  const { mutate } = useModels()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  })

  const handleDownloadModel = async (data: z.infer<typeof formSchema>) => {
    const modelName = data.name.trim()
    startDownload(modelName)

    const throttledSetProgress = throttle((progress: number) => {
      setDownloadProgress(progress)
    }, 200)

    const lastStatus: string | null = null

    try {
      const response = await fetch('/api/model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName }),
      })

      if (!response.ok) {
        throw new Error('Network response was not ok')
      }

      if (!response.body) {
        throw new Error('Something went wrong')
      }

      await processStream(response.body, throttledSetProgress, lastStatus)

      toast.success('Model downloaded successfully')
      mutate() // Fetch the updated list of models after download
      // onClose(); // Close the dialog after download
      onOpenChange(false) // Close the dialog after download
    } catch (error) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Failed to download model'}`)
    } finally {
      stopDownload()
      throttledSetProgress.cancel()
    }
  }

  const processStream = async (
    body: ReadableStream<Uint8Array>,
    throttledSetProgress: (progress: number) => void,
    lastStatus: string | null,
  ) => {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      buffer += text

      let boundary = buffer.indexOf('\n')
      while (boundary !== -1) {
        const jsonString = buffer.slice(0, boundary).trim()
        buffer = buffer.slice(boundary + 1)

        if (jsonString) {
          try {
            const responseJson = JSON.parse(jsonString)

            if (responseJson.error) {
              throw new Error(responseJson.error)
            }

            if (responseJson.completed !== undefined && responseJson.total !== undefined) {
              const progress = (responseJson.completed / responseJson.total) * 100
              throttledSetProgress(progress)
            }

            if (responseJson.status && responseJson.status !== lastStatus) {
              toast.info(`Status: ${responseJson.status}`)
              lastStatus = responseJson.status
            }
          } catch (error) {
            throw new Error(`Error parsing JSON: ${error}`)
          }
        }

        boundary = buffer.indexOf('\n')
      }
    }

    // Handle any remaining data in the buffer
    if (buffer.trim()) {
      try {
        const responseJson = JSON.parse(buffer.trim())

        if (responseJson.error) {
          throw new Error(responseJson.error)
        }

        if (responseJson.completed !== undefined && responseJson.total !== undefined) {
          const progress = (responseJson.completed / responseJson.total) * 100
          throttledSetProgress(progress)
        }

        if (responseJson.status && responseJson.status !== lastStatus) {
          toast.info(`Status: ${responseJson.status}`)
          lastStatus = responseJson.status
        }
      } catch (error) {
        throw new Error(`Error parsing JSON: ${error}`)
      }
    }
  }

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    handleDownloadModel(data)
  }

  useEffect(() => {
    if (!isDownloading) {
      mutate() // Fetch models when the download completes
    }
  }, [isDownloading, mutate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Download Model</DialogTitle>
          <DialogDescription>
            Download additional AI models to use in your courses
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="mb-4 flex rounded-md bg-muted p-3">
            <Info className="mr-2 h-5 w-5 flex-shrink-0 text-blue-500" />
            <p className="text-sm">
              Downloaded models will be stored locally. Make sure you have enough disk space
              available.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="llama2"
                        value={field.value || ''}
                      />
                    </FormControl>
                    <p className="pt-1 text-xs">
                      Check the{' '}
                      <a
                        href="https://ollama.com/library"
                        target="_blank"
                        className="text-blue-500 underline"
                      >
                        library
                      </a>{' '}
                      for a list of available models.
                    </p>
                    <FormMessage />
                    <div className="w-full space-y-2">
                      <Button type="submit" className="w-full" disabled={isDownloading}>
                        {isDownloading ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>
                              Downloading {downloadingModel}... {downloadProgress.toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          'Download model'
                        )}
                      </Button>
                      <p className="text-center text-xs">
                        {isDownloading
                          ? 'This may take a while. You can safely close this modal and continue using the app.'
                          : 'Pressing the button will download the specified model to your device.'}
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        {/* <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter> */}
      </DialogContent>
    </Dialog>
  )
}
