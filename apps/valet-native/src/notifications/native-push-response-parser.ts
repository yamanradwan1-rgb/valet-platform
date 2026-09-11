import { parseNativePushWirePayload } from "./native-push-payload";
import type { NativePushRouteIntent } from "./native-push-response-types";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Expo objects and notification presentation content stop at this boundary. */
export function normalizeNativePushResponse(
  value: unknown,
  defaultActionIdentifier: string,
): NativePushRouteIntent | null {
  const response = object(value);
  if (
    response === null ||
    response.actionIdentifier !== defaultActionIdentifier ||
    ("userText" in response && response.userText !== undefined)
  ) {
    return null;
  }
  const notification = object(response.notification);
  const request = object(notification?.request);
  const content = object(request?.content);
  if (content === null || !("data" in content)) return null;
  const payload = parseNativePushWirePayload(content.data);
  if (payload === null || payload.routeIntent !== "TASK_QUEUE") return null;
  return { intentId: payload.intentId, routeIntent: "TASK_QUEUE" };
}
