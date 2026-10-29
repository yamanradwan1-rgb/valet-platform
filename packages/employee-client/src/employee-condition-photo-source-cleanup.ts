/** Resource cleanup is best effort here; Native's private owner independently fails closed. */
export function discardConditionPhotoSources(
  options: {
    readonly discard: (handle: string) => Promise<void>;
    readonly discardThumbnail?: (uri: string) => Promise<void>;
  },
  handles: readonly string[],
  thumbnails: readonly string[],
): void {
  for (const handle of new Set(handles))
    void options.discard(handle).catch(() => undefined);
  if (options.discardThumbnail)
    for (const uri of new Set(thumbnails))
      void options.discardThumbnail(uri).catch(() => undefined);
}
