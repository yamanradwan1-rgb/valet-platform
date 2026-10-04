import {
  AntiAbuseRateLimitError,
  AntiAbuseService,
} from "../anti-abuse/anti-abuse.service";

// Existing AntiAbuse rolling window: 15 minutes. User identity spans sessions/targets.
export const presenceAbuseLimits = {
  CHALLENGE: { scope: "v1:shift-presence-challenge-user", threshold: 30 },
  EXCEPTION: { scope: "v1:shift-presence-exception-user", threshold: 10 },
  STATUS: { scope: "v1:shift-presence-status-user", threshold: 180 },
} as const;

export async function admitPresenceRequest(
  limiter: AntiAbuseService,
  userId: string,
  kind: keyof typeof presenceAbuseLimits,
) {
  const { scope, threshold } = presenceAbuseLimits[kind];
  const decision = await limiter.count(limiter.key(scope, userId), threshold);
  if (!decision.allowed)
    throw new AntiAbuseRateLimitError(
      "SHIFT_PRESENCE_RATE_LIMITED",
      decision.retryAfter,
    );
}
