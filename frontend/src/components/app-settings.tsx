import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog'

import { Settings } from 'lucide-react'
import SettingsForm from './app-settings-form'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

export default function AppSettings() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex w-full cursor-pointer items-center gap-2 p-1">
          <Settings className="h-4 w-4" />
          <p>Settings</p>
        </div>
      </DialogTrigger>
      <DialogContent className="space-y-2">
        <DialogTitle>Settings</DialogTitle>
        <VisuallyHidden>
          <DialogDescription />
        </VisuallyHidden>
        <SettingsForm />
      </DialogContent>
    </Dialog>
  )
}
