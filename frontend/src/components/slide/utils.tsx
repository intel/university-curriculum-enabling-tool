import { Badge } from '@/components/ui/badge'
import type { ReactNode } from 'react'

// Helper function to format quiz options in A) B) C) D) format
export const formatQuizOptions = (options: string[] | undefined): ReactNode | null => {
  if (!options || options.length === 0) return null

  return (
    <div className="mt-2 space-y-2">
      {options.map((option, index) => (
        <div key={index} className="flex">
          <span className="mr-2 font-medium">{String.fromCharCode(65 + index)})</span>
          <span>{option}</span>
        </div>
      ))}
    </div>
  )
}

// Updated renderExplanation function to handle all discussion question fields
export const renderExplanation = (
  explanation: string | object | undefined,
  ideaType: string,
): ReactNode => {
  if (!explanation) return null

  // If explanation is a string (legacy format)
  if (typeof explanation === 'string') {
    return <div className="whitespace-pre-wrap">{explanation}</div>
  }

  // If explanation is an object (our standardized format)
  if (typeof explanation === 'object') {
    const explanationObj = explanation as {
      modelAnswer?: string
      explanation?: string
      criteria?: Array<string | { name: string; weight: number; description?: string }>
      pointAllocation?: string | object | unknown[]
      feedback?: string
      [key: string]: unknown
    }

    // For discussion questions with the new simplified format
    if (ideaType.toLowerCase().includes('discussion') && explanationObj.modelAnswer) {
      return (
        <div className="space-y-3">
          {/* Model Answer Section */}
          <div>
            <h6 className="mb-1 font-medium">Model Answer:</h6>
            <div className="whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">
              {explanationObj.modelAnswer}
            </div>
          </div>

          {/* Explanation Section */}
          <div>
            <h6 className="mb-1 font-medium">Explanation:</h6>
            <div className="whitespace-pre-wrap">
              {explanationObj.explanation || 'This question helps explore key concepts.'}
            </div>
          </div>
        </div>
      )
    }

    // Original rendering for other assessment types
    return (
      <div className="space-y-3">
        {/* Render criteria if available */}
        {Array.isArray(explanationObj.criteria) && explanationObj.criteria.length > 0 && (
          <div>
            <h6 className="mb-1 font-medium">Marking Criteria:</h6>
            <div className="space-y-2">
              {explanationObj.criteria.map(
                (
                  criterion: string | { name: string; weight: number; description?: string },
                  idx: number,
                ) => {
                  // Handle both string criteria and object criteria with name/weight
                  const criterionName =
                    typeof criterion === 'object' && criterion !== null ? criterion.name : criterion
                  const criterionWeight =
                    typeof criterion === 'object' && criterion !== null ? criterion.weight : null

                  return (
                    <div key={idx} className="flex items-center justify-between">
                      <span>{criterionName}</span>
                      {criterionWeight !== null && (
                        <Badge variant="outline">{criterionWeight}%</Badge>
                      )}
                    </div>
                  )
                },
              )}
            </div>
          </div>
        )}

        {/* Render point allocation if available */}
        {explanationObj.pointAllocation && (
          <div>
            <h6 className="mb-1 font-medium">Point Allocation:</h6>
            <div className="space-y-1">
              {typeof explanationObj.pointAllocation === 'string' ? (
                <div className="whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">
                  {explanationObj.pointAllocation}
                </div>
              ) : typeof explanationObj.pointAllocation === 'object' &&
                explanationObj.pointAllocation !== null ? (
                <div className="rounded-md bg-muted p-2 text-sm">
                  {/* Handle nested object structure for pointAllocation */}
                  {Object.entries(explanationObj.pointAllocation).map(([key, value], idx) => {
                    if (typeof value === 'object' && value !== null) {
                      // Handle nested objects (like the example in the image)
                      return (
                        <div key={idx} className="mb-2">
                          <div className="font-medium">
                            {key.replace(/([A-Z])/g, ' $1').trim()}:
                          </div>
                          <div className="pl-4">
                            {Object.entries(value as object).map(([subKey, subValue], subIdx) => (
                              <div key={subIdx} className="flex items-center justify-between py-1">
                                <span>{subKey.replace(/([A-Z])/g, ' $1').trim()}</span>
                                <Badge variant="outline">{String(subValue)} points</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    } else {
                      // Handle simple key-value pairs
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between border-b border-muted-foreground/20 py-1 last:border-0"
                        >
                          <span>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <Badge variant="outline">{String(value)} points</Badge>
                        </div>
                      )
                    }
                  })}
                </div>
              ) : Array.isArray(explanationObj.pointAllocation) ? (
                <div className="rounded-md bg-muted p-2 text-sm">
                  {(explanationObj.pointAllocation as unknown[]).map(
                    (value: unknown, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between border-b border-muted-foreground/20 py-1 last:border-0"
                      >
                        <span>Component {idx + 1}</span>
                        <Badge variant="outline">{String(value)} points</Badge>
                      </div>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Render feedback if available (for quiz questions) */}
        {explanationObj.feedback && (
          <div>
            <h6 className="mb-1 font-medium">Feedback:</h6>
            <div className="whitespace-pre-wrap">{explanationObj.feedback}</div>
          </div>
        )}

        {/* Render any other fields in the explanation object */}
        {Object.entries(explanationObj)
          .filter(
            ([key]) =>
              !['criteria', 'pointAllocation', 'feedback', 'modelAnswer', 'explanation'].includes(
                key,
              ),
          )
          .map(([key, value]) => (
            <div key={key}>
              <h6 className="mb-1 font-medium capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}:
              </h6>
              <div className="whitespace-pre-wrap">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </div>
            </div>
          ))}
      </div>
    )
  }

  return null
}

/**
 * Parses and formats material items that might be in JSON format
 * @param material The material item which could be a string, JSON string, or object
 * @returns Properly formatted material item as a React node
 */
export const formatMaterial = (material: unknown): ReactNode => {
  // If it's already an object, format it directly
  if (typeof material === 'object' && material !== null) {
    const materialObj = material as Record<string, unknown>
    if (materialObj.name) {
      return (
        <>
          <span className="font-medium">{String(materialObj.name)}</span>
          {materialObj.quantity && <span> (Quantity: {String(materialObj.quantity)})</span>}
          {(materialObj.preparation_notes || materialObj['preparation notes']) && (
            <div className="ml-6 mt-1 text-sm text-muted-foreground">
              <em>
                Preparation:{' '}
                {String(materialObj.preparation_notes || materialObj['preparation notes'])}
              </em>
            </div>
          )}
        </>
      )
    }
    // For other objects, stringify them but clean up the format
    return (
      <>
        {JSON.stringify(material)
          .replace(/[{}"[\]]/g, '')
          .replace(/,/g, ', ')}
      </>
    )
  }

  // If it's a string that looks like JSON, try to parse it
  if (typeof material === 'string' && (material.startsWith('{') || material.startsWith('['))) {
    try {
      const parsed = JSON.parse(material)
      return formatMaterial(parsed) // Recursively format the parsed object
    } catch (e) {
      // If parsing fails, return the original string
      console.log('Failed to parse material JSON:', e)
      return <>{material}</>
    }
  }

  // For regular strings, return as is
  return <>{material}</>
}
