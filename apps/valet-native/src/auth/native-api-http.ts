import { employeeNetworkError } from "@valet/employee-client";

export const nativeDebugApiOrigin = "http://10.0.2.2:3001";

export function validateNativeApiOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Native API origin is not configured safely.");
  }
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname !== "/"
  ) {
    throw new Error("Native API origin is not configured safely.");
  }
  if (
    parsed.protocol !== "https:" &&
    !(__DEV__ && parsed.protocol === "http:")
  ) {
    throw new Error("Native release authentication requires HTTPS.");
  }
  return parsed.origin;
}

export function resolveNativeApiOrigin(
  configuredOrigin = process.env.EXPO_PUBLIC_API_ORIGIN,
): string {
  const apiOrigin =
    configuredOrigin ?? (__DEV__ ? nativeDebugApiOrigin : undefined);
  if (apiOrigin === undefined) {
    throw new Error(
      "Native API origin is required for release authentication.",
    );
  }
  return validateNativeApiOrigin(apiOrigin);
}

export async function readNativeResponsePayload(
  response: Response,
): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw employeeNetworkError();
  }
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
