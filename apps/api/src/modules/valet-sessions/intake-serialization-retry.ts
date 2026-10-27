import { randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { IntakeSessionCommandError } from "./intake-session-types";

const maximumAttempts = 5;

/**
 * Retry only a known serialization abort of the complete atomic Intake attempt.
 * The caller must finish rollback/release before rejecting. Never use this for
 * external side effects or an ambiguous connection/COMMIT acknowledgement.
 */
export async function retryIntakeSerialization<T>(
  attempt: () => Promise<T>,
): Promise<T> {
  for (let number = 1; ; number += 1) {
    try {
      return await attempt();
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== "40001") throw error;
      if (number === maximumAttempts) {
        throw new IntakeSessionCommandError("INTAKE_CONCURRENCY_CONFLICT");
      }
      // Equal jitter prevents tight synchronized retries. No connection is held
      // by this policy while sleeping. Total scheduled delay is at most 375ms.
      const ceilingMs = 25 * 2 ** (number - 1);
      await delay(randomInt(Math.floor(ceilingMs / 2), ceilingMs + 1));
    }
  }
}
