import type { GuestPushProviderResultClass } from "./guest-push-provider";

type Attempt = "1" | "2" | "3" | "4";
type DelayBucket = "10_19" | "20_39" | "40_60";
type LatencyBucket = "LT_100" | "100_499" | "500_1999" | "2000_PLUS";

export type GuestPushObservation =
  | { readonly attempt: Attempt; readonly event: "CLAIM"; readonly reclaimed: boolean }
  | {
      readonly event: "PROVIDER_RESULT";
      readonly latencyBucket: LatencyBucket;
      readonly resultClass: GuestPushProviderResultClass;
    }
  | { readonly delayBucket: DelayBucket; readonly event: "RETRY_SCHEDULED" }
  | {
      readonly event: "SUPPRESSED";
      readonly reason: "ELIGIBILITY_LOST" | "SENDING_DISABLED";
    }
  | { readonly event: "EXPIRED" | "TERMINAL_FAILURE" | "INVALID_ENDPOINT" }
  | {
      readonly dueCount: number;
      readonly event: "BACKLOG";
      readonly oldestDueAgeSeconds: number;
    }
  | {
      readonly deliveries: number;
      readonly event: "CLEANUP";
      readonly intents: number;
      readonly registrations: number;
    }
  | {
      readonly event: "MAINTENANCE";
      readonly suppressedDeliveries: number;
      readonly terminalizedDeliveries: number;
      readonly terminalizedRegistrations: number;
    };

export interface GuestPushObserver {
  observe(observation: GuestPushObservation): Promise<void> | void;
}

export class ConsoleGuestPushObserver implements GuestPushObserver {
  observe(observation: GuestPushObservation): void {
    const fields = Object.entries(observation)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(" ");
    console.info(`GUEST_PUSH_METRIC ${fields}`);
  }
}

export async function observeGuestPushSafely(
  observer: GuestPushObserver,
  observation: GuestPushObservation,
): Promise<void> {
  try {
    await observer.observe(observation);
  } catch {
    // Telemetry is never Guest authority or delivery truth.
  }
}

export function guestPushRetryDelayBucket(seconds: number): DelayBucket {
  if (seconds < 20) return "10_19";
  if (seconds < 40) return "20_39";
  return "40_60";
}

export function guestPushLatencyBucket(milliseconds: number): LatencyBucket {
  if (milliseconds < 100) return "LT_100";
  if (milliseconds < 500) return "100_499";
  if (milliseconds < 2_000) return "500_1999";
  return "2000_PLUS";
}
