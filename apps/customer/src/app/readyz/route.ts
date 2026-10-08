import { checkCustomerApiReadiness } from "../../lib/readiness/customer-readiness";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export async function GET(): Promise<Response> {
  const ready = await checkCustomerApiReadiness();
  return new Response(JSON.stringify({ status: ready ? "ready" : "unavailable" }), {
    status: ready ? 200 : 503,
    headers,
  });
}
