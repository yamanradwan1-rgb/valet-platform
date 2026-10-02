export interface PlateRoiRect {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

export interface PlateRoiGeometry {
  readonly generation: number;
  readonly mountId: number;
  readonly revision: number;
  readonly width: number;
  readonly height: number;
  readonly guide: PlateRoiRect;
}

export interface PlateRoiMetadata {
  readonly generation: number;
  readonly mountId: number;
  readonly revision: number;
  readonly previewWidth: number;
  readonly previewHeight: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
  /** Row-major native-preview pixels → actual upright JPEG boundary pixels. */
  readonly previewToImage: readonly number[];
}

const positive = (value: number) => Number.isFinite(value) && value > 0;
const invalid = () => new Error("Plate crop geometry is unavailable.");

export function plateGuide(width: number, height: number): PlateRoiRect {
  if (!positive(width) || !positive(height)) throw invalid();
  const guideWidth = Math.min(0.8 * width, 520, 3.2 * 0.36 * height);
  const guideHeight = guideWidth / 3.2;
  return {
    originX: (width - guideWidth) / 2,
    originY: (height - guideHeight) / 2,
    width: guideWidth,
    height: guideHeight,
  };
}

export function validPlateMatrix(matrix: readonly number[]): boolean {
  if (matrix.length !== 9 || !matrix.every(Number.isFinite)) return false;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0, i = 0] =
    matrix;
  const determinant =
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  // CameraX/bitmap transforms are affine. Reject unproven projective mappings.
  return (
    Number.isFinite(determinant) &&
    determinant !== 0 &&
    g === 0 &&
    h === 0 &&
    i === 1
  );
}

/** No inference from requested picture sizes, sensor aspect, screen or locale. */
export function plateRoiCrop(
  geometry: PlateRoiGeometry,
  metadata: PlateRoiMetadata,
  actual: { readonly width: number; readonly height: number },
): PlateRoiRect {
  if (
    geometry.generation !== metadata.generation ||
    geometry.mountId !== metadata.mountId ||
    geometry.revision !== metadata.revision ||
    actual.width !== metadata.imageWidth ||
    actual.height !== metadata.imageHeight ||
    !Number.isSafeInteger(actual.width) ||
    !Number.isSafeInteger(actual.height) ||
    ![
      actual.width,
      actual.height,
      geometry.width,
      geometry.height,
      metadata.previewWidth,
      metadata.previewHeight,
    ].every(positive) ||
    !validPlateMatrix(metadata.previewToImage)
  )
    throw invalid();
  const guide = geometry.guide;
  if (
    ![guide.originX, guide.originY].every(Number.isFinite) ||
    !positive(guide.width) ||
    !positive(guide.height) ||
    guide.originX < 0 ||
    guide.originY < 0 ||
    guide.originX + guide.width > geometry.width ||
    guide.originY + guide.height > geometry.height
  )
    throw invalid();
  const m = metadata.previewToImage;
  const corners = [
    [guide.originX, guide.originY],
    [guide.originX + guide.width, guide.originY],
    [guide.originX, guide.originY + guide.height],
    [guide.originX + guide.width, guide.originY + guide.height],
  ].map(([x = 0, y = 0]) => {
    const px = (x * metadata.previewWidth) / geometry.width;
    const py = (y * metadata.previewHeight) / geometry.height;
    return [m[0]! * px + m[1]! * py + m[2]!, m[3]! * px + m[4]! * py + m[5]!];
  });
  const xs = corners.map(([x]) => x!);
  const ys = corners.map(([, y]) => y!);
  const left = Math.min(...xs),
    right = Math.max(...xs);
  const top = Math.min(...ys),
    bottom = Math.max(...ys);
  if (
    ![left, right, top, bottom].every(Number.isFinite) ||
    left < 0 ||
    top < 0 ||
    right > actual.width ||
    bottom > actual.height ||
    right <= left ||
    bottom <= top
  )
    throw invalid();
  const marginX = (right - left) * 0.1;
  const marginY = (bottom - top) * 0.1;
  const x0 = Math.max(0, Math.floor(left - marginX));
  const y0 = Math.max(0, Math.floor(top - marginY));
  const x1 = Math.min(actual.width, Math.ceil(right + marginX));
  const y1 = Math.min(actual.height, Math.ceil(bottom + marginY));
  if (x1 <= x0 || y1 <= y0) throw invalid();
  return { originX: x0, originY: y0, width: x1 - x0, height: y1 - y0 };
}
