/**
 * Utility functions to generate consistent context-related messages
 */

/**
 * Get the appropriate title for a "no context available" message
 */
export function getNoContextAvailableTitle(contextType: string): string {
  return `No ${contextType === 'model' ? 'Models' : 'Courses'} Available`
}

/**
 * Get the appropriate description for a "no context available" message
 */
export function getNoContextAvailableDescription(
  contextType: string,
  extendedMessage: string = '',
): string {
  return (
    `You need to add ${contextType === 'model' ? 'AI models' : 'courses'} ` +
    `${extendedMessage} ${
      contextType === 'model'
        ? 'Models power the AI responses in the current feature'
        : 'Courses provide the context for the current feature'
    }`
  )
}

/**
 * Get the appropriate title for a "select context first" message
 */
export function getSelectContextTitle(contextType: string): string {
  return `Select a ${contextType} First`
}

/**
 * Get the appropriate description for a "select context first" message
 */
export function getSelectContextDescription(
  contextType: string,
  extendedMessage: string = '',
): string {
  return (
    `Please select ${contextType === 'model' ? 'a model' : 'a course'} ` + `${extendedMessage}`
    // `before starting a conversation.`
  )
}

/**
 * Get the appropriate button text for adding context
 */
export function getAddContextButtonText(contextType: string): string {
  return `Add ${contextType === 'model' ? 'Models' : 'Courses'}`
}
