import { EmployeeApiError } from "../api/employee-api-errors";

export async function executeStaffAuthFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error: unknown) {
    if (init.signal?.aborted) {
      throw error;
    }
    throw new EmployeeApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message:
        "Network connection unavailable. Please check your internet connection.",
      isNetworkError: true,
    });
  }
}

export async function parseStaffAuthJsonPayload(
  response: Response,
): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
