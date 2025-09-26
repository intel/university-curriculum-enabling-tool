'use client'

import * as React from 'react'
import {
  Search,
  Trash2,
  MoreHorizontal,
  X,
  FileUp,
  FilePlus,
  Loader2,
  FileIcon,
  Unplug,
  FileAudio2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSourcesStore } from '@/lib/store/sources-store'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
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
import { SidebarGroup, SidebarGroupContent, SidebarInput } from './ui/sidebar'
import { useSources } from '@/lib/hooks/use-sources'
import { useUploadSource } from '@/lib/hooks/use-upload-source'
import { useDeleteSource } from '@/lib/actions/delete-source'
import { useRenameSource } from '@/lib/actions/rename-source'

export function SourcesList() {
  const { sources, toggleSourceSelection, setSources } = useSourcesStore()
  const { isLoading, isError, mutate } = useSources()
  const { uploadSource, isUploading } = useUploadSource()
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectAll, setSelectAll] = React.useState(false)
  const [droppedFiles, setDroppedFiles] = React.useState<File[]>([])

  const filteredSources = sources.filter((source) =>
    source?.name?.toLowerCase().includes(searchTerm.toLowerCase()),
  )
  const selectedSources = filteredSources.filter((source) => source.selected)

  const { renameSourceById } = useRenameSource()
  const { deleteSourceById, deleteSelectedSources } = useDeleteSource()

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked)
    const updatedSources = sources.map((source) => ({
      ...source,
      selected: checked,
    }))
    setSources(updatedSources)
  }

  const handleSourceSelection = (id: number, checked: boolean) => {
    toggleSourceSelection(id, checked)
    const allSelected = sources.every((source) => source.selected)
    setSelectAll(allSelected)
  }

  React.useEffect(() => {
    const allSelected = sources.length > 0 && sources.every((source) => source.selected)
    setSelectAll(allSelected)
  }, [sources])

  const handleDeleteSelected = async () => {
    await deleteSelectedSources(selectedSources.map((s) => s.id))
    mutate()
  }

  const removeDroppedFile = (index: number) => {
    setDroppedFiles((files) => files.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    for (const file of droppedFiles) {
      const supportedTypes = ['application/pdf']
      // const supportedTypes = ["application/pdf", "audio/mpeg", "audio/wav"]
      if (supportedTypes.includes(file.type)) {
        await uploadSource(file)
      } else {
        toast.error(`${file.name} is not a PDF file and was skipped.`)
        // toast.error(`${file.name} is not a supported file type (PDF, MP3, WAV) and was skipped.`);
      }
    }
    setDroppedFiles([])
    mutate()
  }

  const onDrop = React.useCallback((acceptedFiles: File[]) => {
    setDroppedFiles((prevFiles) => [...prevFiles, ...acceptedFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
    },
    multiple: true,
  })

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-2 p-0 pt-2">
      <SidebarGroup className="py-0">
        <SidebarGroupContent className="relative">
          <form className="relative mb-2 pl-2">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground opacity-50" />
            <SidebarInput
              id="search"
              placeholder="Search sources"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-8"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setSearchTerm('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </form>
          <div className="flex items-center justify-between pl-2">
            <span className="text-xs text-muted-foreground">
              Total sources: {filteredSources.length}
            </span>
            <div className="space-x-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={selectedSources.length === 0}
                    className="size-7 h-8"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the selected
                      source(s).
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSelected}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <div className="flex items-center space-x-2 p-2">
            <Checkbox
              id="select-all"
              className="border-sidebar-border text-sidebar-primary-foreground shadow-none data-[state=checked]:border-sidebar-foreground data-[state=checked]:bg-sidebar-foreground"
              checked={selectAll}
              onCheckedChange={handleSelectAll}
            />
            <label
              htmlFor="select-all"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Select All
            </label>
            <span className="ml-2 text-xs text-muted-foreground">
              ({selectedSources.length} selected)
            </span>
          </div>
          <div className="flex h-[calc(100vh-236px)] flex-col">
            <ScrollArea className="flex-grow">
              {isLoading ? (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                  <Loader2 strokeWidth={0.8} className="h-10 w-10 animate-spin" />
                  <p className="mb-4 text-sm text-muted-foreground">Loading sources</p>
                </div>
              ) : isError ? (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                  <Unplug strokeWidth={0.8} className="h-10 w-10 text-muted-foreground" />
                  <p className="mb-4 text-sm text-muted-foreground">
                    Error loading sources. Please try again.
                  </p>
                </div>
              ) : filteredSources.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                  <FileIcon strokeWidth={0.8} className="h-10 w-10 text-muted-foreground" />
                  <p className="mb-4 text-sm text-muted-foreground">No sources uploaded yet</p>
                </div>
              ) : (
                filteredSources.map((source) => (
                  <div
                    key={source.id}
                    className="group flex items-center space-x-2 rounded-md px-2 py-2 hover:bg-accent"
                  >
                    <Checkbox
                      className="border-sidebar-border text-sidebar-primary-foreground shadow-none data-[state=checked]:border-sidebar-foreground data-[state=checked]:bg-sidebar-foreground"
                      checked={source.selected}
                      onCheckedChange={(checked) =>
                        handleSourceSelection(source.id, checked as boolean)
                      }
                    />
                    {/* <FileIcon className="h-4 w-4 text-muted-foreground" /> */}
                    {source.name.toLowerCase().endsWith('.mp3') ||
                    source.name.toLowerCase().endsWith('.wav') ? (
                      <FileAudio2 className="h-4 w-4 text-blue-500" />
                    ) : (
                      <FileIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate text-sm" title={source.name}>
                      {source.name.length > 18
                        ? source.name.substring(0, 13) + '...' + source.name.slice(-3)
                        : source.name}
                    </span>
                    {selectedSources.length <= 1 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            className="size-6 opacity-0 hover:bg-accent-foreground/10 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* <DropdownMenuItem
                        onSelect={() => {
                          const newName = prompt("Enter new name", source.name);
                          if (newName) renameSource(source.id, newName);
                        }}
                      >
                        Rename
                      </DropdownMenuItem> */}
                          {/* <DropdownMenuItem
                        onSelect={async () => {
                          const newName = prompt("Enter new name", source.name)
                          if (newName) {
                            await renameSourceById(source.id, newName)
                            mutate()
                          }
                        }}
                      >
                        Rename
                      </DropdownMenuItem> */}

                          <DropdownMenuItem
                            onSelect={async () => {
                              const fileNameParts = source.name.split('.')
                              const extension = fileNameParts.pop()
                              const currentName = fileNameParts.join('.')
                              const newName = prompt('Enter new name', currentName)
                              if (newName && newName !== currentName) {
                                const newFullName = `${newName}.${extension}`
                                await renameSourceById(source.id, newFullName)
                                mutate()
                              }
                            }}
                          >
                            Rename
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the
                                  source.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    await deleteSourceById(source.id)
                                    mutate()
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <div className="size-6" />
                    )}
                  </div>
                ))
              )}
            </ScrollArea>
            <div className="mt-2 border-t p-2">
              <p className="mb-2 text-center text-xs text-muted-foreground">
                Uploaded sources will be used for RAG (Retrieval-Augmented Generation) to enhance AI
                responses across all features.
              </p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="h-8 w-full" variant="outline">
                    <FilePlus className="h-3 w-3" />
                    Add Source
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Source</DialogTitle>
                    <DialogDescription>
                      Upload a file to add as a source. Uploaded sources can be selected and used as
                      a knowledge base for LLM RAG features, including chat, quiz, and more.
                    </DialogDescription>
                  </DialogHeader>
                  <div
                    {...getRootProps()}
                    className="cursor-pointer rounded-md border-2 border-dashed p-8 text-center"
                  >
                    <input {...getInputProps()} />
                    {isDragActive ? (
                      <div>
                        <FileUp strokeWidth={0.8} className="mx-auto h-10 w-10 text-primary" />
                        <p className="pt-4 text-xs text-muted-foreground">
                          Drop the files here ...
                        </p>
                      </div>
                    ) : (
                      <div>
                        <FileUp
                          strokeWidth={0.8}
                          className="mx-auto h-8 w-8 text-muted-foreground"
                        />
                        <p className="pt-4 text-xs text-muted-foreground">
                          Drag & drop files here, or click to select files
                        </p>
                        <p className="text-xs text-muted-foreground">
                          (Supported formats: PDF)
                          {/* (Supported formats: PDF, MP3, WAV) */}
                        </p>
                      </div>
                    )}
                  </div>
                  {droppedFiles.length > 0 && (
                    <div className="mt-4">
                      <h4 className="mb-2 text-sm font-medium">
                        Files to upload ({droppedFiles.length}):
                      </h4>
                      <ScrollArea className="h-[200px]">
                        {droppedFiles.map((file, index) => (
                          // <div key={index} className="flex items-center justify-between py-2">
                          //   <span className="text-sm truncate">{file.name}</span>
                          //   <Button variant="ghost" size="icon" onClick={() => removeDroppedFile(index)}>
                          //     <X className="h-4 w-4" />
                          //   </Button>
                          <div
                            key={index}
                            className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent"
                          >
                            <div className="flex items-center space-x-2">
                              {file.type.startsWith('audio/') ? (
                                <FileAudio2 className="h-4 w-4" />
                              ) : (
                                <FileIcon className="h-4 w-4" />
                              )}
                              <span className="text-sm" title={file.name}>
                                {file.name.length > 25
                                  ? file.name.substring(0, 22) +
                                    '...' +
                                    file.name.substring(file.name.lastIndexOf('.'))
                                  : file.name}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-muted-foreground">
                                {formatFileSize(file.size)}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeDroppedFile(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </ScrollArea>
                    </div>
                  )}
                  <DialogFooter>
                    <Button
                      onClick={handleUpload}
                      disabled={droppedFiles.length === 0 || isUploading}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        'Upload'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    </div>
  )
}
