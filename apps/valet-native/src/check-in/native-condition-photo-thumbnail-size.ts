import { Image } from "react-native";

/** The owned JPEG has no public dimensions; resolve them from its private URI. */
export async function conditionPhotoThumbnailSize(uri: string) {
  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => Image.getSize(uri,
      (width, height) => resolve({ width, height }), reject),
  );
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
      width < 1 || height < 1 || width > 4096 || height > 4096)
    throw new Error("CONDITION_PHOTO_THUMBNAIL_DIMENSIONS_INVALID");
  const scale = Math.min(1, 320 / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)) };
}
