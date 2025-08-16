/**
 * Represents a client-side source object.
 *
 * This interface defines the structure of a source object used on the client side.
 * It includes properties for the source's ID, name, type, metadata, and selection state.
 */
export interface OllamaModel {
  name: string
  modified_at: string
  size: number
  digest: string
  details: {
    format: string
    family: string
    parameter_size: string
    quantization_level: string
  }
  selected?: boolean
}
