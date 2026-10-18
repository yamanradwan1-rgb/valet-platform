/** One fail-closed Expo Native CSPRNG boundary. No JS global or PRNG fallback. */
export interface NativeSecureCrypto {
  getRandomValues(array: Uint8Array): Uint8Array;
  randomUUID(): string;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Deferred lookup lets Support Diagnostics survive missing native autolinking. */
export function resolveNativeSecureCrypto(): NativeSecureCrypto | null {
  try {
    // A deferred static-literal require is necessary to keep diagnostics alive
    // when an Android APK unexpectedly lacks the autolinked native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module: unknown = require("expo-crypto");
    if (!module || typeof module !== "object") return null;
    const candidate = module as Partial<NativeSecureCrypto>;
    if (typeof candidate.getRandomValues !== "function" ||
        typeof candidate.randomUUID !== "function") return null;
    return {
      getRandomValues: (array) => candidate.getRandomValues!(array),
      randomUUID: () => candidate.randomUUID!(),
    };
  } catch {
    return null;
  }
}

export function nativeSecureRandomValues(
  array: Uint8Array,
  provider: NativeSecureCrypto | null = resolveNativeSecureCrypto(),
): Uint8Array {
  if (!(array instanceof Uint8Array) || provider === null)
    throw new Error("NATIVE_CSPRNG_UNAVAILABLE");
  const filled = provider.getRandomValues(array);
  if (filled !== array || filled.length !== array.length)
    throw new Error("NATIVE_CSPRNG_UNAVAILABLE");
  return filled;
}

export function nativeSecureRandomUUID(
  provider: NativeSecureCrypto | null = resolveNativeSecureCrypto(),
): string {
  if (provider === null) throw new Error("NATIVE_CSPRNG_UNAVAILABLE");
  const id = provider.randomUUID();
  if (typeof id !== "string" || !UUID_V4.test(id))
    throw new Error("NATIVE_CSPRNG_UNAVAILABLE");
  return id;
}
