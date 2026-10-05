export function hasOperationalGoogleMapConfig(
  apiKey: string | undefined,
  mapId: string | undefined,
): boolean {
  return Boolean(apiKey?.trim() && mapId?.trim());
}
