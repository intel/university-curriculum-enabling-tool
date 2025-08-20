// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { toast } from 'sonner'

/**
 * Displays an error message as a toast notification.
 *
 * @param error - The error to display, which can be of any type.
 */
export function errorToastHandler(error: unknown): void {
  if (error == null) {
    toast.error(`unknown error`)
    return
  }

  if (typeof error === 'string') {
    toast.error(`${error}`)
    return
  }

  if (error instanceof Error) {
    if (typeof error.message === 'string') {
      toast.error(`${error.message}`)
    } else {
      toast.error('Internal Server Error')
    }
    return
  }

  // Uncomment if you want to display JSON stringified errors
  // toast.error(`${JSON.stringify(error)}`);
}
