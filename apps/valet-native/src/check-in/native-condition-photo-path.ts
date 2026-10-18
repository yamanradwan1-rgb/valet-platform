import { Directory, File, Paths } from "expo-file-system";

/** Only ordinary JPEG file URIs inside this application's private cache. */
export function isOwnedCameraCacheUri(uri: string): boolean {
  const root = Paths.cache.uri.replace(/\/+$/, "") + "/";
  if (!uri.startsWith("file://") || !uri.startsWith(root)) return false;
  const tail = uri.slice(root.length);
  return /\.(jpe?g)$/i.test(tail) && !tail.split("/").some((part) =>
    part === "" || part === "." || part === ".." ||
    /%2e|%2f|%5c/i.test(part));
}

/** Exact SDK 57 output locations; never sweep other features' cache. */
export function isScopedGeneratedSourceUri(uri: string): boolean {
  if (!isOwnedCameraCacheUri(uri)) return false;
  const root = Paths.cache.uri.replace(/\/+$/, "") + "/";
  return /^(Camera|ImageManipulator)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpe?g$/i
    .test(uri.slice(root.length));
}

/** Unknown results may be cleared only after verifying both SDK output dirs. */
export function hasUndiscardedSdkJpeg(): boolean {
  return ["Camera", "ImageManipulator"].some((name) => {
    const dir = new Directory(Paths.cache, name);
    return dir.exists && dir.list().some((entry) =>
      entry instanceof File && isScopedGeneratedSourceUri(entry.uri));
  });
}
