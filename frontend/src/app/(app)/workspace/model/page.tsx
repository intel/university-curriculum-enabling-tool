// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useState, useMemo, useEffect } from 'react'
import { usePersonaStore } from '@/lib/store/persona-store'
import { useModelStore } from '@/lib/store/model-store'
import { getAIService } from '@/lib/providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash,
  Check,
  Box,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ShieldBan,
} from 'lucide-react'
import { ModelDownloader } from '@/components/model-downloader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDeleteModel } from '@/lib/api/model'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  getFilteredRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useRouter } from 'next/navigation'
import type { OllamaModel } from '@/lib/types/ollama-model'

export default function ModelPage() {
  const { activePersona } = usePersonaStore()
  const { models, setSelectedModel } = useModelStore()
  const { deleteModelByName } = useDeleteModel()

  // Get the AI service to determine which library to show
  const aiService = getAIService()
  const modelLibraryName = aiService === 'ovms' ? 'HuggingFace Library' : 'Ollama Library'

  const [searchTerm, setSearchTerm] = useState('')
  const [isDownloaderOpen, setIsDownloaderOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedModels, setSelectedModels] = useState<string[]>([])

  // TanStack Table states
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  })

  const router = useRouter()

  const handleDeleteModels = async () => {
    try {
      if (selectedModels.length === 1) {
        await deleteModelByName(selectedModels[0])
      } else {
        await Promise.all(selectedModels.map((name) => deleteModelByName(name)))
        toast.success('Models Deleted', {
          description: `${selectedModels.length} models have been deleted successfully.`,
        })
      }
    } catch (error) {
      toast.error('Error deleting models', {
        description: 'An error occurred while deleting the models.',
      })
      console.log(`Error deleting models: ${error}`)
    } finally {
      setSelectedModels([])
      table.resetRowSelection()
      setIsDeleteDialogOpen(false)
    }
  }

  const columns = useMemo<ColumnDef<OllamaModel>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            className="ml-4"
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Model Name
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.getValue('name')}</div>
            <div className="max-w-[250px] truncate text-xs text-muted-foreground">
              {row.original.digest.slice(0, 20)}...
            </div>
          </div>
        ),
      },
      {
        id: 'detailParameters',
        accessorFn: (row: OllamaModel) => row.details?.parameter_size,
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Parameters
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => <Badge variant="outline">{row.getValue('detailParameters')}</Badge>,
      },
      {
        id: 'detailQuantization',
        accessorFn: (row: OllamaModel) => row.details?.quantization_level,
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Quantization
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => <Badge variant="outline">{row.getValue('detailQuantization')}</Badge>,
      },
      {
        accessorKey: 'digest',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Digest
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => (
          <div className="max-w-[100px] truncate text-sm">{row.getValue('digest')}</div>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const model = row.original

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSelectedModel(model.name)}>
                  <Check className="mr-2 h-4 w-4" />
                  Select
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedModels([model.name])
                    setIsDeleteDialogOpen(true)
                  }}
                  className="text-destructive"
                >
                  <Trash className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [setSelectedModel],
  )

  // const [data, setData] = useState(() => [...models])
  const [data, setData] = useState<OllamaModel[]>([])

  // This effect will update the table data whenever models in the store changes
  useEffect(() => {
    setData(models)
  }, [models])

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
      globalFilter: searchTerm,
    },
    debugAll: false,
  })

  // Update selectedModels when row selection changes
  useEffect(() => {
    const selectedRows = table.getFilteredSelectedRowModel().rows
    setSelectedModels(selectedRows.map((row) => row.original.name))
  }, [rowSelection, table])

  // Add useEffect to set default column visibility for mobile
  // Add this after the table state declarations
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    // Check if we're on a mobile device
    const isMobile = window.innerWidth < 768

    if (isMobile) {
      // Hide less important columns on mobile
      table.setColumnVisibility({
        select: true,
        name: true,
        actions: true,
        // Hide these columns on mobile
        detailParameters: false,
        detailQuantization: false,
        digest: false,
      })
    }
  }, [table])

  // Replace the direct return with useEffect for redirection
  const [showAccessDenied, setShowAccessDenied] = useState(false)

  useEffect(() => {
    if (activePersona !== 'faculty') {
      setShowAccessDenied(true)
    } else {
      setShowAccessDenied(false)
    }
  }, [activePersona])

  if (showAccessDenied) {
    return (
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
        <ShieldBan strokeWidth={0.6} className="mb-2 h-16 w-16 text-primary" />
        <h1 className="mb-2 text-xl font-semibold">Access Denied</h1>
        <p className="mb-4 max-w-md text-sm text-muted-foreground">
          Only faculty members can access the model management page.
        </p>
      </div>
    )
  }

  // If no models, show welcome screen
  if (models.length === 0) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
          <Box strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
          <h1 className="mb-2 text-2xl font-bold">Add Your First Model</h1>
          <p className="mb-4 max-w-md text-sm text-muted-foreground">
            Add AI models to power your courses. Different AI models have different capabilities and
            specialties.
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="flex items-center">
                <Plus className="mr-1 h-4 w-4" />
                Add Model
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setIsDownloaderOpen(true)}>
                Add Pre-trained Model From {modelLibraryName}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled
                onClick={() => router.push('/workspace/model/upload_model')}
              >
                Add Fine-tuned Model (Coming Soon)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ModelDownloader open={isDownloaderOpen} onOpenChange={setIsDownloaderOpen} />
      </div>
    )
  }

  return (
    <div className="container mx-auto flex h-full max-w-5xl flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="justify-left flex flex-col">
          <h1 className="text-lg font-semibold">Models</h1>
          <p className="text-sm text-muted-foreground">
            List of available models to use in your courses
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="flex items-center">
              <Plus className="mr-1 h-4 w-4" />
              Add Model
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="mr-2">
            <DropdownMenuItem onClick={() => setIsDownloaderOpen(true)}>
              Add Pre-trained Model From {modelLibraryName}
            </DropdownMenuItem>
            <DropdownMenuItem disabled onClick={() => router.push('/workspace/model/upload_model')}>
              Add Fine-tuned Model (Coming Soon)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="relative w-full flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search models"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              table.setGlobalFilter(e.target.value)
            }}
            className="w-full pl-8"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {selectedModels.length > 0
            ? `${selectedModels.length} selected`
            : // : `${filteredModels.length} models`}
              `${table.getFilteredRowModel().rows.length} models`}
        </span>

        {selectedModels.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="flex items-center"
          >
            <Trash className="h-4 w-4" />
            Delete Selected
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-hidden rounded-md border">
        <ScrollArea className="h-full">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </div>

      <div className="flex flex-col items-center justify-between space-y-2 py-4 sm:flex-row sm:space-x-2 sm:space-y-0">
        <div className="flex-1 text-center text-sm text-muted-foreground sm:text-left">
          Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}{' '}
          to{' '}
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            table.getFilteredRowModel().rows.length,
          )}{' '}
          of {table.getFilteredRowModel().rows.length} entries
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <div className="text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      </div>

      {/* Model Downloader Dialog */}
      <ModelDownloader open={isDownloaderOpen} onOpenChange={setIsDownloaderOpen} />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete
              {selectedModels.length === 1
                ? ' the selected model'
                : ` ${selectedModels.length} selected models`}
              from your device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteModels}
              className="flex items-center bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
