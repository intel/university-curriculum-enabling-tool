'use client'

import { useEffect, useState } from 'react'
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
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { throttle } from 'lodash'
import { Info, Loader2 } from 'lucide-react'
import type { AIService } from '@/lib/providers'

interface ModelDownloaderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const formSchema = z.object({
  name: z.string().min(1, {
    message: 'Please select a model to download',
  }),
  hfToken: z.string().optional(),
})

export function ModelDownloader({ open, onOpenChange }: ModelDownloaderProps) {
  const [aiService, setAiService] = useState<AIService>('ollama')

  const {
    isDownloading,
    downloadProgress,
    downloadingModel,
    startDownload,
    stopDownload,
    setDownloadProgress,
  } = useChatStore()

  const { mutate } = useModels()

  // Fetch provider info on mount
  useEffect(() => {
    const fetchProviderInfo = async () => {
      try {
        const response = await fetch('/api/provider-info')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.provider) {
            setAiService(data.provider.service)
          }
        }
      } catch (error) {
        console.error('Failed to fetch provider info:', error)
      }
    }
    fetchProviderInfo()
  }, [])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: standardSchemaResolver(formSchema),
    defaultValues: {
      name: '',
      hfToken: '',
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
      // Use different endpoints based on AI service
      const endpoint = aiService === 'ovms' ? '/api/ovms/download-model' : '/api/model'
      const requestBody =
        aiService === 'ovms'
          ? {
              modelId: modelName,
              hfToken: data.hfToken || undefined,
            }
          : { name: modelName }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error('Network response was not ok')
      }

      if (!response.body) {
        throw new Error('Something went wrong')
      }

      await processStream(response.body, throttledSetProgress, lastStatus)

      toast.success(
        aiService === 'ovms'
          ? 'Model downloaded and converted successfully'
          : 'Model downloaded successfully',
      )
      mutate() // Fetch the updated list of models after download
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
          <DialogTitle>
            {aiService === 'ovms'
              ? 'Add Pre-trained Model from HuggingFace Library'
              : 'Download Model'}
          </DialogTitle>
          <DialogDescription>
            {aiService === 'ovms'
              ? 'Download and convert models from HuggingFace Hub to use in your courses'
              : 'Download additional AI models to use in your courses'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="mb-4 flex rounded-md bg-muted p-3">
            <Info className="mr-2 h-5 w-5 flex-shrink-0 text-blue-500" />
            <p className="text-sm">
              {aiService === 'ovms'
                ? 'Models will be downloaded from HuggingFace Hub, converted to OpenVINO IR format, and configured for OVMS. This process may take 10-30 minutes depending on model size.'
                : 'Downloaded models will be stored locally. Make sure you have enough disk space available.'}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
              {/* Model Name Field */}
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
                        placeholder={
                          aiService === 'ovms' ? 'OpenVINO/Qwen2.5-1.5B-Instruct-int8-ov' : 'llama2'
                        }
                        value={field.value || ''}
                      />
                    </FormControl>
                    <p className="pt-1 text-xs">
                      Check the{' '}
                      <a
                        href={
                          aiService === 'ovms'
                            ? 'https://huggingface.co/OpenVINO/models'
                            : 'https://ollama.com/library'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 underline"
                      >
                        library
                      </a>{' '}
                      for a list of available models.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* HuggingFace Token Field (OVMS only) */}
              {aiService === 'ovms' && (
                <FormField
                  control={form.control}
                  name="hfToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>HuggingFace Token</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="hf_xxxxxxxxxxxxxxxxxxxxx"
                          value={field.value || ''}
                        />
                      </FormControl>
                      <p className="pt-1 text-xs">
                        Get your token from{' '}
                        <a
                          href="https://huggingface.co/settings/tokens"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 underline"
                        >
                          HuggingFace Settings
                        </a>
                        . Required for downloading models. Leave empty to use server-side token.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Submit Button */}
              <div className="w-full space-y-2">
                <Button type="submit" className="w-full" disabled={isDownloading}>
                  {isDownloading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>
                        {aiService === 'ovms' ? 'Converting' : 'Downloading'} {downloadingModel}...{' '}
                        {downloadProgress.toFixed(0)}%
                      </span>
                    </div>
                  ) : (
                    <>{aiService === 'ovms' ? 'Download and Convert Model' : 'Download model'}</>
                  )}
                </Button>
                <p className="text-center text-xs">
                  {isDownloading
                    ? aiService === 'ovms'
                      ? 'Model conversion is in progress. This may take 10-30 minutes. You can safely close this modal.'
                      : 'This may take a while. You can safely close this modal and continue using the app.'
                    : aiService === 'ovms'
                      ? 'Pressing the button will download the model from HuggingFace and convert it to OpenVINO IR format.'
                      : 'Pressing the button will download the specified model to your device.'}
                </p>
              </div>
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
