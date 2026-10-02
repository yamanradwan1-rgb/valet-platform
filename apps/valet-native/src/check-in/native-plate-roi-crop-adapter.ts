import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { PlateRoiRect } from "./native-plate-roi-geometry";

export interface PlateRoiImage {
  save(quality: number): Promise<{
    readonly uri: string;
    readonly width: number;
    readonly height: number;
  }>;
  release(): void;
}

/** One crop/render; compression fallback saves the same cropped native image. */
export async function renderPlateRoi(
  uri: string,
  crop: PlateRoiRect,
): Promise<PlateRoiImage> {
  const context = ImageManipulator.manipulate(uri);
  try {
    context.crop(crop);
    const image = await context.renderAsync();
    return {
      save: (quality) =>
        image.saveAsync({
          format: SaveFormat.JPEG,
          compress: quality,
          base64: false,
        }),
      release() {
        try {
          image.release();
        } finally {
          context.release();
        }
      },
    };
  } catch {
    context.release();
    throw new Error("Plate cropping unavailable.");
  }
}
