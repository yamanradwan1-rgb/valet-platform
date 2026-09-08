export function nativeOnlineHint(): boolean {
  const candidate = globalThis.navigator as
    { readonly onLine?: unknown } | undefined;
  return typeof candidate?.onLine === "boolean" ? candidate.onLine : true;
}
