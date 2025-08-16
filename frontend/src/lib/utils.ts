import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function formatDateByGroup(date: Date): string {
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - date.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays <= 1) {
    // Today, show time
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays <= 7) {
    // Within a week, show day name
    return date.toLocaleDateString([], { weekday: 'long' })
  } else {
    // More than a week ago, show date
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
}

export function extractNameFromEmail(email: string): string {
  const namePart = email.split('@')[0]
  return namePart.replace('.', ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

/**
 * Splits a given text into an array of tokens (words).
 *
 * This function uses whitespace as the delimiter to tokenize the text, and filters out
 * any empty tokens that may result from multiple spaces.
 *
 * @param text - The text to tokenize.
 * @returns An array of tokens (words) extracted from the text.
 */
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/**
 * Joins an array of tokens (words) into a single string with spaces between each token.
 *
 * This function is the inverse of `tokenize` and is useful for reconstructing text
 * from an array of tokens.
 *
 * @param tokens - An array of tokens to join.
 * @returns A single string formed by joining the tokens with spaces.
 */
export function detokenize(tokens: string[]): string {
  return tokens.join(' ')
}

/**
 * Returns the effective token count for a given token.
 * For tokens longer than the threshold (e.g. 15 characters),
 * we treat them as if they were exactly `longTokenThreshold` characters long.
 * For tokens shorter than or equal to the threshold, we approximate using an ideal of 4 characters per token.
 */
export function effectiveTokenCount(token: string): number {
  const idealCharsPerToken = 4
  return Math.ceil(token.length / idealCharsPerToken)
}

// Helper function: Computes effective token count for an entire text.
export function effectiveTokenCountForText(text: string): number {
  const tokens = tokenize(text)
  return tokens.reduce((sum, token) => sum + effectiveTokenCount(token), 0)
}

/**
 * Increments a version string in YYYY.MM.PATCH format
 * @param version Current version in YYYY.MM.PATCH format
 * @returns Incremented version
 */
export function incrementVersion(version: string): string {
  const parts = version.split('.')

  if (parts.length < 3) {
    // If version doesn't have 3 parts, add a patch number
    return `${version}.1`
  }

  const [year, month, patch] = parts
  // Increment the patch version without changing the original formatting for year and month
  const incrementedPatch = Number(patch) + 1

  return `${year}.${month}.${incrementedPatch}`
}

/**
 * Checks if a version string is in valid YYYY.MM.PATCH format
 * @param version Version string to validate
 * @returns Boolean indicating if format is valid
 */
export function isValidVersionFormat(version: string): boolean {
  return /^\d{4}\.\d{1,2}\.\d{1,3}$/.test(version)
}

/**
 * Formats a date object into a string in the format YYYY-MM-DD
 * @param date Date object to format
 * @returns String in YYYY-MM-DD format
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0') // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * Compares two version strings in YYYY.MM.PATCH format
 * @param v1 First version string
 * @param v2 Second version string
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if v1 == v2
 */
export function compareVersions(v1: string, v2: string): number {
  // Handle undefined or empty strings
  if (!v1) return -1
  if (!v2) return 1

  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)

  // Ensure we have at least 3 parts (YYYY.MM.PATCH)
  while (parts1.length < 3) parts1.push(0)
  while (parts2.length < 3) parts2.push(0)

  // Compare year
  if (parts1[0] !== parts2[0]) return parts1[0] > parts2[0] ? 1 : -1

  // Compare month
  if (parts1[1] !== parts2[1]) return parts1[1] > parts2[1] ? 1 : -1

  // Compare patch
  if (parts1[2] !== parts2[2]) return parts1[2] > parts2[2] ? 1 : -1

  // All parts are equal
  return 0
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function generateAbbreviation(softwareName: string): string {
  return softwareName
    .split(/[\s-]+/) // Split by spaces or hyphens
    .map((word) => word[0].toLowerCase()) // Take the first letter of each word
    .join('') // Join the letters to form the abbreviation
}
