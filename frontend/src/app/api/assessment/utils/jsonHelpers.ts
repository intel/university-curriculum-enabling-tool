// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { jsonrepair } from 'jsonrepair'
import type { ExtractedJson } from '../types/assessment.types'
import { stripCodeFences, logAssessmentDebug } from './generalHelpers'

// Improve the extractJsonFromText function to be more robust
export function extractJsonFromText(text: string): string | null {
  try {
    // Clean up the text first - remove markdown code block markers
    const cleanedText = stripCodeFences(text)

    // First, try to parse the entire text as JSON directly
    try {
      JSON.parse(cleanedText)
      logAssessmentDebug('Direct JSON parsing successful')
      return cleanedText // If it parses successfully, return the entire text
    } catch {
      logAssessmentDebug('Direct parsing failed, trying alternative extraction methods')
    }

    // Try jsonrepair on the whole cleaned text as an early fallback
    try {
      let repairedWhole: string
      try {
        repairedWhole = jsonrepair(cleanedText)
      } catch (e) {
        logAssessmentDebug('jsonrepair failed on entire text in extractJsonFromText:', e)
        repairedWhole = cleanedText
      }
      JSON.parse(repairedWhole)
      logAssessmentDebug('jsonrepair succeeded on entire text in extractJsonFromText')
      return repairedWhole
    } catch {
      // continue
    }

    // Look for JSON array pattern with more flexible regex
    const arrayRegex = /(\[[\s\S]*?\])/g
    const arrayMatches = cleanedText.match(arrayRegex)

    if (arrayMatches && arrayMatches.length > 0) {
      // Try each match until we find valid JSON
      for (const match of arrayMatches) {
        try {
          const sanitized = sanitizeJsonString(match)
          // Test if it's valid JSON by parsing it
          JSON.parse(sanitized)
          logAssessmentDebug('Found valid JSON array in text fragment')
          return sanitized
        } catch {
          // Try jsonrepair for this fragment
          try {
            let repaired: string
            try {
              repaired = jsonrepair(match)
            } catch (e) {
              logAssessmentDebug('jsonrepair failed on array fragment, continuing:', e)
              throw e
            }
            JSON.parse(repaired)
            logAssessmentDebug('jsonrepair succeeded on array fragment')
            return repaired
          } catch {
            // Continue to next match if this one isn't valid
            continue
          }
        }
      }
    }

    // Look for JSON object pattern with more flexible regex
    const jsonRegex = /(\{[\s\S]*?\})/g
    const matches = cleanedText.match(jsonRegex)

    if (matches && matches.length > 0) {
      // Try each match until we find valid JSON
      for (const match of matches) {
        try {
          const sanitized = sanitizeJsonString(match)
          // Test if it's valid JSON by parsing it
          JSON.parse(sanitized)
          logAssessmentDebug('Found valid JSON in text fragment')
          return sanitized
        } catch {
          // Try jsonrepair for this fragment
          try {
            let repaired: string
            try {
              repaired = jsonrepair(match)
            } catch (e) {
              logAssessmentDebug('jsonrepair failed on object fragment, continuing:', e)
              throw e
            }
            JSON.parse(repaired)
            logAssessmentDebug('jsonrepair succeeded on object fragment')
            return repaired
          } catch {
            // Continue to next match if this one isn't valid
            continue
          }
        }
      }
    }

    // If no valid JSON object found, try to extract JSON from the text
    // This handles cases where the JSON might be embedded in other text
    const startBrace = cleanedText.indexOf('{')
    const endBrace = cleanedText.lastIndexOf('}')
    const startBracket = cleanedText.indexOf('[')
    const endBracket = cleanedText.lastIndexOf(']')

    // Try to extract object
    if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
      const jsonCandidate = cleanedText.substring(startBrace, endBrace + 1)
      try {
        const sanitized = sanitizeJsonString(jsonCandidate)
        JSON.parse(sanitized)
        logAssessmentDebug('Extracted JSON object from text using brace positions')
        return sanitized
      } catch (e) {
        logAssessmentDebug('Failed to parse JSON object extracted using brace positions:', e)
        try {
          let repaired: string
          try {
            repaired = jsonrepair(jsonCandidate)
          } catch (e2) {
            logAssessmentDebug('jsonrepair failed on object extracted by braces:', e2)
            throw e2
          }
          JSON.parse(repaired)
          logAssessmentDebug('jsonrepair succeeded on object extracted by braces')
          return repaired
        } catch (e2) {
          logAssessmentDebug('jsonrepair also failed on object extracted by braces:', e2)
        }
      }
    }

    // Try to extract array
    if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
      const jsonCandidate = cleanedText.substring(startBracket, endBracket + 1)
      try {
        const sanitized = sanitizeJsonString(jsonCandidate)
        JSON.parse(sanitized)
        logAssessmentDebug('Extracted JSON array from text using bracket positions')
        return sanitized
      } catch (e) {
        logAssessmentDebug('Failed to parse JSON array extracted using bracket positions:', e)
        try {
          let repaired: string
          try {
            repaired = jsonrepair(jsonCandidate)
          } catch (e2) {
            logAssessmentDebug('jsonrepair failed on array extracted by brackets:', e2)
            throw e2
          }
          JSON.parse(repaired)
          logAssessmentDebug('jsonrepair succeeded on array extracted by brackets')
          return repaired
        } catch (e2) {
          logAssessmentDebug('jsonrepair also failed on array extracted by brackets:', e2)
        }
      }
    }

    // Try to extract specific fields if full JSON parsing fails
    const extractedJson: ExtractedJson = {}

    // Extract type
    const typeMatch = cleanedText.match(/"type"\s*:\s*"([^"]+)"/)
    if (typeMatch && typeMatch[1]) {
      extractedJson.type = typeMatch[1]
    }

    // Extract duration
    const durationMatch = cleanedText.match(/"duration"\s*:\s*"([^"]+)"/)
    if (durationMatch && durationMatch[1]) {
      extractedJson.duration = durationMatch[1]
    }

    // Extract description
    const descMatch = cleanedText.match(/"description"\s*:\s*"([^"]+)"/)
    if (descMatch && descMatch[1]) {
      extractedJson.description = descMatch[1]
    }

    // Extract questions array if present
    const questionsMatch = cleanedText.match(/"questions"\s*:\s*(\[[\s\S]*?\])/)
    if (questionsMatch && questionsMatch[1]) {
      try {
        extractedJson.questions = JSON.parse(questionsMatch[1])
        logAssessmentDebug('Extracted questions array from text')
      } catch (e) {
        logAssessmentDebug('Failed to parse extracted questions array:', e)
      }
    }

    // If we extracted any fields, return the constructed JSON
    if (Object.keys(extractedJson).length > 0) {
      logAssessmentDebug('Constructed JSON from extracted fields:', extractedJson)
      return JSON.stringify(extractedJson)
    }

    logAssessmentDebug('No valid JSON structure found in text')
    return null
  } catch (e) {
    console.error('Error in extractJsonFromText:', e)
    return null
  }
}

// Improve the sanitizeJsonString function to be more robust
export function sanitizeJsonString(jsonString: string): string {
  try {
    // Remove any non-printable characters
    let cleaned = jsonString.replace(/[\x00-\x1F\x7F-\x9F]/g, '')

    // Fix common JSON syntax issues
    cleaned = cleaned
      // Fix unescaped backslashes
      // NOTE: Negative lookbehind is not supported in all JS environments.
      // This replacement function manually checks for unescaped backslashes.
      .replace(/\\/g, (match, offset, str) => {
        // Count the number of consecutive backslashes preceding this one
        let backslashCount = 0
        for (let i = offset - 1; i >= 0 && str[i] === '\\'; i--) {
          backslashCount++
        }
        // If the count is odd, this backslash is escaped
        if (backslashCount % 2 === 1) return match
        // If the following characters form a valid escape sequence, leave as is.
        const next = str.slice(offset + 1, offset + 6)
        if (next.match(/^["\\/bfnrt]/) || next.match(/^u[0-9a-fA-F]{4}/)) {
          return match
        }
        // Otherwise, escape the backslash.
        return '\\\\'
      })
      // Fix unescaped quotes in strings
      // [REMOVED] Overly broad quote escaping block that could corrupt JSON string values
      // Fix trailing commas in objects and arrays
      .replace(/,\s*}/g, '}')
      .replace(/,\s*\]/g, ']')
      // Fix missing quotes around property names
      .replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3')
      // Fix newlines in string values
      .replace(/"\s*\n\s*([^"]*)"/g, '" $1"')
      // Fix missing commas between array elements
      .replace(/}(\s*){/g, '},\n$1{')
      .replace(/](\s*)\[/g, '],\n$1[')
      // Fix extra commas
      .replace(/,(\s*[}\]])/g, '$1')

    return cleaned
  } catch (e) {
    console.error('Error in sanitizeJsonString:', e)
    return jsonString // Return original if sanitization fails
  }
}
