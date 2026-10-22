export type GuestRequestClass = "A" | "B" | "C" | "D";

export function guestRatePolicyMode(
  environment: NodeJS.ProcessEnv = process.env,
): "ACTIVE" | "COMPATIBILITY" {
  const mode =
    environment.GUEST_T3_RATE_POLICY ??
    (environment.NODE_ENV === "production" ? "COMPATIBILITY" : "ACTIVE");
  if (mode !== "ACTIVE" && mode !== "COMPATIBILITY")
    throw new Error("Guest rate policy is invalid.");
  return mode;
}

export const guestRequestPolicy = {
  windowSeconds: 900,
  aggregate: 864,
  classes: { A: 784, B: 32, C: 32, D: 16 },
  sourceFailures: 60,
  unknownCredential: 180,
  enrollmentAllocations: 4000,
  envelope: { A: 392, B: 16, C: 16, D: 2 },
} as const;

export const guestRouteClasses = {
  "GET /v1/guest/session": "A",
  "GET /v1/guest/information": "A",
  "GET /v1/guest/valet-sessions/:sessionId/payment": "A",
  "GET /v1/guest/push/config": "A",
  "POST /v1/guest/browser-session/enroll": "B",
  "POST /v1/guest/browser-session/exchange": "B",
  "POST /v1/guest/browser-session/prepare": "B",
  "POST /v1/guest/browser-session/switch": "B",
  "POST /v1/guest/browser-session/switch/reconcile": "B",
  "POST /v1/guest/browser-session/end": "B",
  "POST /v1/guest/push/registration": "B",
  "POST /v1/guest/session/request-retrieval": "C",
  "POST /v1/guest/session/cancel-retrieval": "C",
  "POST /v1/guest/session/rating": "C",
  "PATCH /v1/guest/payment/tip": "C",
  "POST /v1/guest/session/handoff-verification/issue": "D",
  "POST /v1/guest/session/handoff-verification/rotate": "D",
} as const satisfies Record<string, GuestRequestClass>;
