/**
 * Defensive MediaStream track cleanup (DEC-067 §3).
 *
 * The scanner must never leave a camera LED running: beyond the decoder's own
 * stop handle, every track of the preview MediaStream is stopped. Duck-typed
 * on purpose so the obligation is testable without a real browser stream.
 */

/** Stops every track of a MediaStream-like object; returns how many stopped. */
export function stopAllStreamTracks(stream: unknown): number {
  if (typeof stream !== "object" || stream === null) return 0;
  const getTracks = (stream as { getTracks?: unknown }).getTracks;
  if (typeof getTracks !== "function") return 0;
  const tracks: unknown = getTracks.call(stream);
  if (typeof tracks !== "object" || tracks === null) return 0;
  let stopped = 0;
  for (const track of tracks as readonly unknown[]) {
    if (typeof track !== "object" || track === null) continue;
    const stop = (track as { stop?: unknown }).stop;
    if (typeof stop === "function") {
      stop.call(track);
      stopped += 1;
    }
  }
  return stopped;
}
