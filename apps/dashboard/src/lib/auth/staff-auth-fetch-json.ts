import { dashboardNetworkError } from "../api/dashboard-api-error";
import { abortReason } from "./staff-auth-abort";

/** Transport-only helper; authorization and identity transitions stay in StaffAuthClient. */
export async function fetchStaffAuthJson(
  fetcher: typeof globalThis.fetch,
  baseUrl: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly payload: unknown;
  readonly headers: Headers;
}> {
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "include",
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error: unknown) {
    if (signal?.aborted) throw abortReason(signal);
    throw dashboardNetworkError(error);
  }
  const text = await response.text();
  let payload: unknown = {};
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    payload,
    headers: response.headers,
  };
}
