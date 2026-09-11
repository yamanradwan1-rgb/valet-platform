import type { StaffPushProviderResultClass } from "./staff-push-provider";

export type StaffPushObservation =
  | {
      readonly event: "CLAIM";
      readonly attempt: "1" | "2" | "3" | "4";
      readonly reclaimed: boolean;
    }
  | {
      readonly event: "PROVIDER_RESULT";
      readonly resultClass: StaffPushProviderResultClass;
    }
  | {
      readonly event: "RETRY_SCHEDULED";
      readonly delayBucket: "10_19" | "20_39" | "40_60";
    }
  | {
      readonly event: "SUPPRESSED";
      readonly reason: "ELIGIBILITY_LOST" | "SENDING_DISABLED";
    }
  | { readonly event: "EXPIRED" | "TERMINAL_FAILURE" }
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
    };

export interface StaffPushObserver {
  observe(observation: StaffPushObservation): Promise<void> | void;
}

export class NoopStaffPushObserver implements StaffPushObserver {
  observe(observation: StaffPushObservation): void {
    void observation;
  }
}

export function retryDelayBucket(seconds: number): "10_19" | "20_39" | "40_60" {
  if (seconds < 20) return "10_19";
  if (seconds < 40) return "20_39";
  return "40_60";
}
