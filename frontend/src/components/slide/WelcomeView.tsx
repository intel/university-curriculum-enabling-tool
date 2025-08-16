'use client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { ArrowRight, Info, LayoutTemplate } from 'lucide-react'
import type { View } from '@/lib/types/slide'

interface WelcomeViewProps {
  setCurrentView: (view: View) => void
}

export function WelcomeView({ setCurrentView }: WelcomeViewProps) {
  return (
    <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 pt-6 lg:min-w-[750px] xl:min-w-[1000px]">
      <div className="hide-scrollbar flex-1 overflow-y-auto pb-16">
        <Card className="mb-6 w-full">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <LayoutTemplate className="h-5 w-5" />
              Welcome to Course Content Generator
            </CardTitle>
            <CardDescription>
              Create comprehensive teaching materials from your source documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="mb-2 font-medium">How it works:</h3>
              <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                <li>Upload or select your source materials using the sidebar</li>
                <li>Configure your content type, style, and other preferences</li>
                <li>Generate complete, ready-to-use teaching materials</li>
                <li>Customize and edit the generated content as needed</li>
                <li>Export to PowerPoint or PDF for easy sharing</li>
              </ol>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>RAG-powered Content Generation</AlertTitle>
              <AlertDescription>
                This tool uses Retrieval Augmented Generation (RAG) to create content based on your
                selected source documents. <br />
                The quality of the generated content depends on the relevance and quality of your
                source materials.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
      <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 text-center backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button onClick={() => setCurrentView('config')} className="w-full md:max-w-[700px]">
          <span>Create Teaching Materials</span>
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
