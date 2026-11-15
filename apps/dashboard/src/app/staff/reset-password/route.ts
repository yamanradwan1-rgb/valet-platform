export const dynamic = "force-dynamic";

export function GET(): Response {
  // Option C: no public password-reset UI until a separately approved release.
  // Keep the preserved reset document/component source dormant, not reachable.
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
