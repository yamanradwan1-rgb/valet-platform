import { isConflict, isMfaRequired } from "./administration-error";

export interface SensitiveMutationEffects<T> {
  readonly isCurrent: () => boolean;
  readonly onConflict?: (() => void) | undefined;
  readonly onError: (reason: unknown) => void;
  readonly onMfaRequired: () => void;
  readonly onSuccess?: ((result: T) => void) | undefined;
}

export async function executeSensitiveMutation<T>(
  operation: () => Promise<T>,
  effects: SensitiveMutationEffects<T>,
): Promise<void> {
  try {
    const result = await operation();
    if (effects.isCurrent()) effects.onSuccess?.(result);
  } catch (reason) {
    if (!effects.isCurrent()) return;
    if (isMfaRequired(reason)) {
      effects.onMfaRequired();
      return;
    }
    effects.onError(reason);
    if (isConflict(reason)) effects.onConflict?.();
  }
}
