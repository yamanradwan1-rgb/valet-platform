import { vi } from "vitest";
import type { CameraView } from "expo-camera";
import type {
  PlateRoiSource,
  createNativePlateOcrBinding,
} from "../src/check-in/native-plate-ocr-adapter";
import { plateGuide } from "../src/check-in/native-plate-roi-geometry";

const roiImageMocks = vi.hoisted(() => ({
  render: vi.fn(),
  save: vi.fn(),
  release: vi.fn(),
}));
vi.mock("../src/check-in/native-plate-roi-crop-adapter", () => ({
  renderPlateRoi: async (
    uri: string,
    crop: { width: number; height: number },
  ) => {
    roiImageMocks.render(uri, crop);
    return {
      save: async (quality: number) => {
        roiImageMocks.save(quality);
        return {
          uri: `${uri}.roi-${quality}.jpg`,
          width: crop.width,
          height: crop.height,
        };
      },
      release: () => roiImageMocks.release(),
    };
  },
}));

export const roiGeometry = {
  generation: 1,
  mountId: 1,
  revision: 1,
  width: 360,
  height: 260,
  guide: plateGuide(360, 260),
};
export const roiPreview = {
  width: 360,
  height: 260,
  sensorToView: [1, 0, 0, 0, 1, 0, 0, 0, 1],
};
export function roiPicture(uri: string, tokens = roiGeometry) {
  return {
    uri,
    width: 720,
    height: 1280,
    plateRoiMetadata: {
      generation: tokens.generation,
      mountId: tokens.mountId,
      revision: tokens.revision,
      previewWidth: 360,
      previewHeight: 260,
      imageWidth: 720,
      imageHeight: 1280,
      previewToImage: [2, 0, 0, 0, 2, 380, 0, 0, 1],
    },
  };
}
export function roiSource(camera: CameraView): PlateRoiSource {
  const value = { camera, geometry: roiGeometry, preview: roiPreview };
  return { capture: () => value, isCurrent: (other) => other === value };
}
export async function mountRoiCamera(
  binding: ReturnType<typeof createNativePlateOcrBinding>,
  camera: CameraView,
) {
  const { generation, mountId } = binding.controller.current();
  binding.cameraRef(camera, generation, mountId);
  binding.cameraLayout(generation, mountId, 360, 260);
  await binding.cameraReady(generation, mountId);
}

export { roiImageMocks };
