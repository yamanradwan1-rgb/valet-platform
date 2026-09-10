export type NativeWorkflowOrigin =
  "CHECK_IN" | "PARKING" | "RETRIEVAL" | "HANDOFF";

export interface NativeContextualTarget {
  readonly origin: NativeWorkflowOrigin;
  readonly sessionId: string;
}

export type NativeContextualRoute = NativeContextualTarget & {
  readonly kind: "guest-access" | "incident";
};

export function nativeContextualRoute(
  kind: NativeContextualRoute["kind"],
  origin: NativeWorkflowOrigin,
  sessionId: string,
): NativeContextualRoute | null {
  const normalized = sessionId.trim();
  return normalized.length === 0
    ? null
    : { kind, origin, sessionId: normalized };
}
