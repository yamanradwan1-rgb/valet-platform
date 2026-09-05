export const NATIVE_PLATE_TARGET_LONG_EDGE = 1920;
export const NATIVE_PLATE_TARGET_SHORT_EDGE = 1080;
export const NATIVE_PLATE_MIN_LONG_EDGE = 1024;
export const NATIVE_PLATE_MIN_SHORT_EDGE = 576;
export const NATIVE_PLATE_PRIMARY_JPEG_QUALITY = 0.6;
export const NATIVE_PLATE_FALLBACK_JPEG_QUALITY = 0.45;

interface PictureSizeCandidate {
  readonly value: string;
  readonly longEdge: number;
  readonly shortEdge: number;
  readonly score: number;
}

function candidate(value: string): PictureSizeCandidate | undefined {
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
    shortEdge > NATIVE_PLATE_TARGET_LONG_EDGE ||
    longEdge < NATIVE_PLATE_MIN_LONG_EDGE ||
    shortEdge < NATIVE_PLATE_MIN_SHORT_EDGE
  )
    return undefined;
  const aspectPenalty = Math.abs(
    longEdge / shortEdge -
      NATIVE_PLATE_TARGET_LONG_EDGE / NATIVE_PLATE_TARGET_SHORT_EDGE,
  );
  return {
    value,
    longEdge,
    shortEdge,
    score:
      Math.abs(longEdge - NATIVE_PLATE_TARGET_LONG_EDGE) +
      Math.abs(shortEdge - NATIVE_PLATE_TARGET_SHORT_EDGE) +
      aspectPenalty * 1000,
  };
}

/** Compares orientation-normalized dimensions but returns an exact supported value. */
export function selectNativePlatePictureSize(
  supported: readonly string[],
): string | undefined {
  return supported
    .map(candidate)
    .filter((value): value is PictureSizeCandidate => value !== undefined)
    .sort(
      (a, b) =>
        a.score - b.score ||
        b.longEdge * b.shortEdge - a.longEdge * a.shortEdge ||
        (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
    )[0]?.value;
}
