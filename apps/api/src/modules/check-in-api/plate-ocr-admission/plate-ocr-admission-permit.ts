import { performance } from "node:perf_hooks";

/** Private one-use capability. Never serialize this or include it in an HTTP DTO. */
export interface OcrAdmissionPermit {
  /** Call synchronously immediately before the single provider fetch. */
  consumeIfFresh(): boolean;
}

export interface OcrAdmissionProof {
  /** Monotonic instant just before the final time-sensitive SQL proof begins. */
  readonly proofStartedAtMs: number;
  /** Conservative DB-authoritative remaining time after the final SQL proof. */
  readonly remainingAuthorizedMs: number;
}

export const OCR_PROOF_MAX_AGE_MS = 250;

/** Only construct after an unambiguously successful admission COMMIT. */
export function createOcrAdmissionPermit(
  proof: OcrAdmissionProof,
  now: () => number = () => performance.now(),
): OcrAdmissionPermit {
  let consumed = false;
  const permittedAgeMs = Math.min(
    OCR_PROOF_MAX_AGE_MS,
    proof.remainingAuthorizedMs,
  );
  return Object.freeze({
    consumeIfFresh(): boolean {
      if (consumed) return false;
      // Burn before checking clock/expiry: even failures must never be replayed.
      consumed = true;
      let current: number;
      try {
        current = now();
      } catch {
        return false;
      }
      const ageMs = current - proof.proofStartedAtMs;
      return (
        Number.isFinite(proof.proofStartedAtMs) &&
        Number.isFinite(proof.remainingAuthorizedMs) &&
        Number.isFinite(current) &&
        Number.isFinite(ageMs) &&
        ageMs >= 0 &&
        ageMs < permittedAgeMs
      );
    },
  });
}
