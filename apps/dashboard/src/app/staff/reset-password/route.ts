import {
  staffPublicResetContentSecurityPolicy,
  staffPublicResetDocument,
} from "../../../features/administration/staff/staff-public-reset-document";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(staffPublicResetDocument(), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": staffPublicResetContentSecurityPolicy,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
