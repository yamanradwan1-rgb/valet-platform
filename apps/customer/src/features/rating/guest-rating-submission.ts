import { GuestApiError } from '../../lib/api/api-error';
import type { GuestApiClient } from '../../lib/api/guest-api-client';

export type RatingOutcome = 'saving' | 'saved' | 'conflict' | 'unavailable' | 'unknown' | 'failed';

/** One in-flight POST per exact browser/session context. No automatic POST retry. */
export class GuestRatingSubmission {
  private sequence = 0;
  private inFlight: {
    sequence: number;
    client: GuestApiClient;
    visitId: string;
  } | null = null;

  invalidate(): void {
    this.sequence += 1;
    this.inFlight = null;
  }

  async submit(
    client: GuestApiClient,
    visitId: string,
    rating: number,
    notify: (outcome: RatingOutcome) => void,
  ): Promise<boolean> {
    if (this.inFlight?.client === client && this.inFlight.visitId === visitId) {
      return false; // duplicate press cannot issue another POST
    }
    const current = { sequence: ++this.sequence, client, visitId };
    this.inFlight = current; // synchronous before first await
    notify('saving');
    try {
      const response = await client.submitRating(rating);
      if (this.inFlight !== current) return true;
      notify(response.valetSessionId === visitId ? 'saved' : 'unknown');
    } catch (error) {
      if (this.inFlight !== current) return true;
      const conflict = error instanceof GuestApiError && error.code === 'GUEST_RATING_CONFLICT';
      const unavailable = error instanceof GuestApiError && (
        error.code === 'GUEST_RATING_NOT_AVAILABLE' || error.code === 'GUEST_ACCESS_INVALID'
      );
      const ambiguous = error instanceof GuestApiError && (
        error.code === 'MUTATION_OUTCOME_UNKNOWN' ||
        error.status === 408 || error.status >= 500
      );
      notify(conflict ? 'conflict' : unavailable ? 'unavailable' : ambiguous ? 'unknown' : 'failed');
    } finally {
      if (this.inFlight === current) this.inFlight = null;
    }
    return true;
  }
}
