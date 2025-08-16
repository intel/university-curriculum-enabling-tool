import { TypeValidationError } from 'ai'

/**
 * Handles errors by returning a string representation of the error.
 *
 * @param error - The error to handle, which can be of any type.
 * @returns A string representation of the error.
 */
export function errorHandler(error: unknown): string {
  if (error == null) {
    return 'unknown error'
  }

  if (typeof error === 'string') {
    return error
  }

  if (TypeValidationError.isInstance(error)) {
    return 'Internal Server Error'
  }

  if (error instanceof Error) {
    return error.message
  }

  return JSON.stringify(error)
}
