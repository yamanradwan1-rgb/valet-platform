import type { OutboundEnvelopeOpener } from "../contracts/outbound-envelope";
import {
  OUTBOUND_LIMITS,
  type OutboundClaim,
  type OutboundLeaseRepository,
} from "../contracts/outbound-lease";
import type { OutboundProvider, OutboundSendResult } from "../contracts/outbound-provider";
import { canonicalGuestOrigin, prepareOutboundSendInput } from "./outbound-transport-payload";
import type { OutboundPermitTransportSource } from "./outbound-transport-source";

export interface OutboundWorkerDependencies {
  readonly leases: OutboundLeaseRepository;
  readonly material: OutboundPermitTransportSource;
  readonly opener: OutboundEnvelopeOpener;
  readonly provider: OutboundProvider;
  readonly guestOrigin: string;
  /** Called after the committed marker; tests use this as a process-death barrier. */
  readonly afterPermitCommit?: () => Promise<void>;
}

const UNKNOWN: OutboundSendResult = { kind: "UNKNOWN", reason: "TRANSPORT" };

/** Transport may start only after the durable DISPATCHING permit commits. */
export class OutboundDeliveryWorker {
  private readonly origin: string;

  constructor(private readonly dependencies: OutboundWorkerDependencies) {
    this.origin = canonicalGuestOrigin(dependencies.guestOrigin);
  }

  async runBatch(shutdown: AbortSignal): Promise<number> {
    if (shutdown.aborted) return 0;
    const claims = await this.dependencies.leases.claimDue(OUTBOUND_LIMITS.claimBatchSize);
    if (claims.length > OUTBOUND_LIMITS.claimBatchSize) {
      throw new Error("OUTBOUND_CLAIM_LIMIT_EXCEEDED");
    }
    let cursor = 0;
    const task = async (): Promise<void> => {
      while (!shutdown.aborted && cursor < claims.length) {
        const claim = claims[cursor++];
        if (claim === undefined) continue;
        await this.executeClaim(claim, shutdown);
      }
    };
    const outcomes = await Promise.allSettled(
      Array.from(
        { length: Math.min(OUTBOUND_LIMITS.maxConcurrencyPerReplica, claims.length) },
        () => task(),
      ),
    );
    const failure = outcomes.find((outcome) => outcome.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    return claims.length;
  }

  private async executeClaim(claim: OutboundClaim, shutdown: AbortSignal): Promise<void> {
    if (shutdown.aborted) return;
    const preparation = await this.dependencies.leases.prepareDispatch(claim);
    if (preparation.kind !== "DISPATCH") return;

    try {
      // A crash anywhere below is recovered from the committed permit as UNKNOWN.
      await this.dependencies.afterPermitCommit?.();
      if (shutdown.aborted) return;
      let result: OutboundSendResult = UNKNOWN;
      const controller = new AbortController();
      const abort = () => controller.abort();
      shutdown.addEventListener("abort", abort, { once: true });
      try {
        if (preparation.remainingMs <= OUTBOUND_LIMITS.providerDeadlineMs) return;
        const material = await this.dependencies.material.loadForPermit(
          claim,
          preparation.attemptId,
        );
        if (material === undefined || shutdown.aborted) return;
        const payload = prepareOutboundSendInput(
          material,
          preparation.attemptHandle,
          this.origin,
          controller.signal,
          this.dependencies.opener,
        );
        const confirmed = await this.dependencies.material.confirmPermit(
          claim,
          preparation.attemptId,
        );
        if (
          confirmed === undefined ||
          confirmed.remainingMs <= OUTBOUND_LIMITS.providerDeadlineMs ||
          shutdown.aborted
        ) return;
        result = await this.sendBounded(payload, controller);
      } catch {
        // Transport/decryption/DB uncertainty after commit can never be replayed.
        result = UNKNOWN;
      } finally {
        shutdown.removeEventListener("abort", abort);
        controller.abort();
      }
      await this.dependencies.leases.finalizeAttempt(claim, preparation.attemptId, result);
    } finally {
      this.dependencies.material.forgetPermit?.(preparation.attemptId);
    }
  }

  private async sendBounded(
    payload: Parameters<OutboundProvider["send"]>[0],
    controller: AbortController,
  ): Promise<OutboundSendResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<OutboundSendResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ kind: "UNKNOWN", reason: "TIMEOUT" });
      }, OUTBOUND_LIMITS.providerDeadlineMs);
    });
    try {
      return await Promise.race([
        this.dependencies.provider.send(payload).catch(() => UNKNOWN),
        timeout,
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
