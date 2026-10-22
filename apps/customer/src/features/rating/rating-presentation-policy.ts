import type { GuestApiClient } from "../../lib/api/guest-api-client";
import type { RatingOutcome } from "./guest-rating-submission";

type PresentationState =
  | "unprompted"
  | "pending"
  | "opened"
  | "dismissed"
  | "submitted"
  | "invalidated";
type PresentationStorage = Pick<Storage, "getItem" | "setItem">;

/** Presentation memory is never authorization or evidence of a server rating. */
export class RatingPresentationPolicy {
  state: PresentationState = "unprompted";

  constructor(
    private readonly storage: PresentationStorage | null,
    private readonly key: string | null,
  ) {}

  begin(): boolean {
    if (this.state !== "unprompted") return false;
    try {
      const previous = this.key ? this.storage?.getItem(this.key) : null;
      if (previous === "dismissed" || previous === "submitted")
        this.state = previous;
    } catch {
      /* Restricted storage: retain mounted-context behavior. */
    }
    if (this.state !== "unprompted") return false;
    this.state = "pending";
    return true;
  }

  opened(): void {
    if (this.state === "pending") this.state = "opened";
  }

  dismiss(): void {
    this.remember("dismissed");
  }

  outcome(value: RatingOutcome): void {
    if (value === "saved" || value === "conflict") this.remember("submitted");
    else if (value === "unknown") this.remember("dismissed");
  }

  invalidate(): void {
    this.state = "invalidated";
  }

  private remember(value: "dismissed" | "submitted"): void {
    if (this.state === "invalidated") return;
    this.state = value;
    try {
      if (this.key) this.storage?.setItem(this.key, value);
    } catch {
      /* Persistence is optional and grants no authority. */
    }
  }
}

const activePolicies = new WeakMap<
  GuestApiClient,
  { visitId: string; policy: RatingPresentationPolicy }
>();

export function bindRatingPresentation(
  client: GuestApiClient,
  visitId: string,
  policy: RatingPresentationPolicy,
) {
  const binding = { visitId, policy };
  activePolicies.set(client, binding);
  return () => {
    if (activePolicies.get(client) === binding) activePolicies.delete(client);
  };
}

export function observeRatingOutcome(
  client: GuestApiClient,
  visitId: string,
  outcome: RatingOutcome,
): void {
  const binding = activePolicies.get(client);
  if (binding?.visitId === visitId) binding.policy.outcome(outcome);
}
