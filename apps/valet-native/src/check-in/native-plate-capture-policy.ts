export const NATIVE_PLATE_TARGET_LONG_EDGE = 1280;
export const NATIVE_PLATE_TARGET_SHORT_EDGE = 720;
export const NATIVE_PLATE_MIN_LONG_EDGE = 1024;
export const NATIVE_PLATE_MIN_SHORT_EDGE = 576;
export const NATIVE_PLATE_FALLBACK_LONG_EDGE = 1024;
export const NATIVE_PLATE_FALLBACK_SHORT_EDGE = 576;
export const NATIVE_PLATE_PRIMARY_JPEG_QUALITY = 0.6;
export const NATIVE_PLATE_FALLBACK_JPEG_QUALITY = 0.45;

interface PictureSizeCandidate {
  readonly value: string;
  readonly longEdge: number;
  readonly shortEdge: number;
  readonly score: number;
}

function candidate(
  value: string,
  targetLongEdge = NATIVE_PLATE_TARGET_LONG_EDGE,
  targetShortEdge = NATIVE_PLATE_TARGET_SHORT_EDGE,
): PictureSizeCandidate | undefined {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) return undefined;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const longEdge = Math.max(first, second);
  const shortEdge = Math.min(first, second);
  if (
    !Number.isSafeInteger(longEdge) ||
    !Number.isSafeInteger(shortEdge) ||
    longEdge > NATIVE_PLATE_TARGET_LONG_EDGE ||
    shortEdge > NATIVE_PLATE_TARGET_SHORT_EDGE ||
    longEdge < NATIVE_PLATE_MIN_LONG_EDGE ||
    shortEdge < NATIVE_PLATE_MIN_SHORT_EDGE
  )
    return undefined;
  const aspectPenalty = Math.abs(
    longEdge / shortEdge - targetLongEdge / targetShortEdge,
  );
  return {
    value,
    longEdge,
    shortEdge,
    score:
      Math.abs(longEdge - targetLongEdge) +
      Math.abs(shortEdge - targetShortEdge) +
      aspectPenalty * 1000,
  };
}

/** Compares orientation-normalized dimensions but returns an exact supported value. */
export function selectNativePlatePictureSize(
  supported: readonly string[],
): string | undefined {
  return supported
    .map((value) => candidate(value))
    .filter((value): value is PictureSizeCandidate => value !== undefined)
    .sort(
      (a, b) =>
        a.score - b.score ||
        b.longEdge * b.shortEdge - a.longEdge * a.shortEdge ||
        (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
    )[0]?.value;
}

/** Selects one exact supported lower-resolution size for a camera retry. */
export function selectNativePlateFallbackPictureSize(
  supported: readonly string[],
  preferred: string,
): string | undefined {
  const selected = candidate(preferred);
  if (!selected) return undefined;
  return supported
    .map((value) =>
      candidate(
        value,
        NATIVE_PLATE_FALLBACK_LONG_EDGE,
        NATIVE_PLATE_FALLBACK_SHORT_EDGE,
      ),
    )
    .filter(
      (value): value is PictureSizeCandidate =>
        value !== undefined &&
        value.value !== preferred &&
        value.longEdge * value.shortEdge <
          selected.longEdge * selected.shortEdge,
    )
    .sort(
      (a, b) =>
        a.score - b.score ||
        b.longEdge * b.shortEdge - a.longEdge * a.shortEdge ||
        (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
    )[0]?.value;
}
