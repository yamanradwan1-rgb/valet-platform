import type { OutboundEnvelopeAAD, SealedOutboundEnvelope } from "../contracts/outbound-envelope";
import type { OutboundClaim } from "../contracts/outbound-lease";

/** Material may be returned only by a sender-role DB function after a committed permit. */
export interface OutboundTransportMaterial {
  readonly sealed: SealedOutboundEnvelope;
  /** Derived again from immutable intent/session scope, never from sealed.aad. */
  readonly expectedAAD: OutboundEnvelopeAAD;
  readonly recipientE164: string;
  readonly templateName: string;
  readonly templateLanguage: "ar" | "en";
  readonly phoneNumberId: string;
  readonly accessToken: string;
  readonly graphVersion: string;
}

export interface OutboundPermitTransportSource {
  /** Re-check scope, consent, recipient, generation, policy and control in SQL. */
  loadForPermit(
    claim: OutboundClaim,
    attemptId: string,
  ): Promise<OutboundTransportMaterial | undefined>;
  /** DB wall-time/lease/kill-switch fence checked immediately before socket I/O. */
  confirmPermit(
    claim: OutboundClaim,
    attemptId: string,
  ): Promise<{ readonly remainingMs: number } | undefined>;
  /** Erase ephemeral sender material after any completion or safe early exit. */
  forgetPermit?(attemptId: string): void;
}
