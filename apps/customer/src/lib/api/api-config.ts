export function getGuestApiBaseUrl(): string {
  // In the browser, use the same-origin Next.js proxy route to prevent CORS issues
  if (typeof window !== 'undefined') {
    return '/api/v1/guest';
  }

  // On the server side (SSR/SSG), resolve to direct API origin
  const apiOrigin = process.env.API_ORIGIN || 'http://localhost:3000';
  return `${apiOrigin}/v1/guest`;
}
