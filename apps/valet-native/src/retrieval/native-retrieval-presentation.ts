import type { FoundationLocale } from "../foundation/foundation-locale";

export function keyCheckoutBoundary(
  sessionId: string | null | undefined,
  taskId: string | null | undefined,
  expectedKey: string | null,
) {
  return `${sessionId ?? "none"}:${taskId ?? "none"}:${expectedKey ?? "none"}`;
}

export function initialKeyCandidate(expectedKey: string | null) {
  return expectedKey ?? "";
}

export function updateKeyCandidate(value: string) {
  return value;
}

export function presentRetrievalFailure(
  failureMessage: string,
  locale: FoundationLocale,
  operationFailed: string,
) {
  return locale === "ar" ? operationFailed : failureMessage;
}
