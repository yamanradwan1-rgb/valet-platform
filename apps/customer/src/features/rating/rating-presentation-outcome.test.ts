import { describe, expect, it, vi } from "vitest";
import { GuestApiError } from "../../lib/api/api-error";
import type { GuestApiClient } from "../../lib/api/guest-api-client";
import { GuestRatingSubmission } from "./guest-rating-submission";
import {
  bindRatingPresentation,
  RatingPresentationPolicy,
} from "./rating-presentation-policy";

describe("#312 explicit submission presentation outcomes", () => {
  it.each(["saved", "conflict", "unknown"] as const)(
    "remembers %s only after an explicit submission",
    async (outcome) => {
      const api = {
        submitRating: vi.fn(async () => {
          if (outcome === "saved") return { valetSessionId: "visit-a" };
          throw new GuestApiError({
            status: outcome === "conflict" ? 409 : 503,
            code:
              outcome === "conflict"
                ? "GUEST_RATING_CONFLICT"
                : "MUTATION_OUTCOME_UNKNOWN",
            message: "test",
          });
        }),
      } as unknown as GuestApiClient;
      const policy = new RatingPresentationPolicy(null, null);
      const unbind = bindRatingPresentation(api, "visit-a", policy);
      policy.begin();
      expect(api.submitRating).not.toHaveBeenCalled();
      await new GuestRatingSubmission().submit(api, "visit-a", 4, () => {});
      expect(policy.state).toBe(
        outcome === "unknown" ? "dismissed" : "submitted",
      );
      expect(api.submitRating).toHaveBeenCalledTimes(1);
      unbind();
    },
  );

  it("never updates another visit or a disposed presentation binding", async () => {
    const api = {
      submitRating: vi.fn(async () => ({ valetSessionId: "visit-a" })),
    } as unknown as GuestApiClient;
    const policy = new RatingPresentationPolicy(null, null);
    const unbind = bindRatingPresentation(api, "visit-b", policy);
    await new GuestRatingSubmission().submit(api, "visit-a", 5, () => {});
    expect(policy.state).toBe("unprompted");
    unbind();
    policy.invalidate();
    await new GuestRatingSubmission().submit(api, "visit-b", 5, () => {});
    expect(policy.state).toBe("invalidated");
  });
});
