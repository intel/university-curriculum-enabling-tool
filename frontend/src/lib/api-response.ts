import { NextResponse } from 'next/server'

/**
 * Creates a standardized success response.
 *
 * This function generates a JSON response for successful operations,
 * including a status code, message, and data payload.
 *
 * @param data - The data to include in the response.
 * @param message - A message describing the success. Defaults to 'Success'.
 * @param status - The HTTP status code for the response. Defaults to 200.
 * @returns A NextResponse object containing the success response.
 */
export const successResponse = (
  data: unknown,
  message: string = 'Success',
  status: number = 200,
) => {
  return NextResponse.json(
    {
      status,
      message,
      data,
    },
    { status },
  )
}

/**
 * Creates a standardized error response.
 *
 * This function generates a JSON response for error situations,
 * including a status code, error message, and optional error details.
 *
 * @param message - A message describing the error.
 * @param errorDetails - Additional details about the error. Defaults to null.
 * @param status - The HTTP status code for the response. Defaults to 500.
 * @returns A NextResponse object containing the error response.
 */
export const errorResponse = (
  message: string,
  errorDetails: unknown = null,
  status: number = 500,
) => {
  return NextResponse.json(
    {
      status,
      message,
      error: {
        code:
          errorDetails && typeof errorDetails === 'object' && 'code' in errorDetails
            ? (errorDetails as { code: string }).code
            : 'UNKNOWN_ERROR',
        details:
          errorDetails && typeof errorDetails === 'object' && 'message' in errorDetails
            ? (errorDetails as { message: string }).message
            : errorDetails || 'An unexpected error occurred',
      },
    },
    { status },
  )
}
