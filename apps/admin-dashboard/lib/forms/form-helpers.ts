/**
 * TanStack Form v0.41+ returns validation errors as StandardSchemaV1Issue objects,
 * not plain strings. This helper extracts a readable message regardless of the
 * error type — handles both the old string format and the new issue object format.
 *
 * Usage:
 *   {field.state.meta.errors[0] && (
 *     <p className="text-xs text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
 *   )}
 */
export function getFieldError(error: unknown): string {
  if (!error) return ""
  if (typeof error === "string") return error
  // StandardSchemaV1Issue shape: { message: string, path?: ..., ... }
  if (typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

/**
 * Note on zodValidator deprecation:
 *
 * In Zod 3.24+, @tanstack/zod-form-adapter exports `zodValidator` which is
 * marked deprecated in favour of `standardSchemaValidator`. However,
 * `standardSchemaValidator` is not yet exported by @tanstack/zod-form-adapter
 * at v0.41.3.
 *
 * The correct fix when the adapter catches up:
 *   import { standardSchemaValidator } from "@tanstack/form-core"
 *   validatorAdapter: standardSchemaValidator()
 *
 * For now: keep using `zodValidator` from @tanstack/zod-form-adapter.
 * Suppress the deprecation warning by keeping the import. It works correctly —
 * the deprecation is forward-looking, not a breaking change.
 *
 * When @tanstack/react-form >= 1.0 ships, switch to:
 *   import { standardSchemaValidator } from "@tanstack/form-core"
 */