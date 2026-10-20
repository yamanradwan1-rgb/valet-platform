import type { KeySlotConfiguration } from "@valet/contracts";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import {
  clearPhysicalResourceOperationId,
  physicalResourceOperationId,
} from "./physical-resource-operation-id";
import { createKeySlot } from "./physical-resources-api";

export interface Issue304KeySlotDraft {
  readonly code: string;
  /** Optional once the separately owned KeySlot.label backend contract is deployed. */
  readonly label?: string;
}

/**
 * Used by an approved Option3 create form that collects an optional key label.
 * Reuses the existing authenticated POST and idempotency ledger; it never
 * creates a client-side resource or silently retries an uncertain mutation.
 *
 * Backend rollout dependency: KeySlot.label must be accepted by W3's
 * createKeySlotRequestSchema and persisted by the authoritative command.
 */
export async function issue304CreateKeySlot(
  api: DashboardApiClient,
  context: {
    readonly identityGeneration: number;
    readonly locationId: string;
  },
  draft: Issue304KeySlotDraft,
): Promise<KeySlotConfiguration> {
  const code = draft.code.trim();
  const label = draft.label?.trim();
  const fields = { code, ...(label ? { label } : {}) };
  const requestKey = JSON.stringify(fields);
  const operationId = physicalResourceOperationId(
    context.identityGeneration,
    context.locationId,
    "key-slot",
    requestKey,
  );
  // Keep the optional field on the wire without widening the older
  // persisted contract type or creating another network client.
  const result = await createKeySlot(api, context.locationId, {
    ...fields,
    operationId,
  });
  clearPhysicalResourceOperationId(
    context.identityGeneration,
    context.locationId,
    "key-slot",
    requestKey,
  );
  return result;
}
