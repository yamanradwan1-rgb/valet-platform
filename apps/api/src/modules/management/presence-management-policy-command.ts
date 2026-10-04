import {
  resolveShiftPresencePolicy,
  type ShiftPresenceCompanySetRequest,
  type ShiftPresenceLocationSetRequest,
  type ShiftPresenceLocationClearRequest,
  type ShiftPresenceField,
  type ShiftPresenceEffectivePolicy,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { PresenceManagementActor } from "./presence-management-authority";
import {
  presenceCompanyPolicy,
  presenceLocationPolicy,
} from "./presence-management-projection";
import { PresenceManagementError } from "./presence-management-errors";

const fieldKeys = {
  shiftStartPresenceMode: "startMode",
  shiftEndPresenceMode: "endMode",
  shiftPresenceMaxAccuracyMeters: "maxAccuracyMeters",
  shiftPresenceMaxFixAgeSeconds: "maxFixAgeSeconds",
} as const;
const overrideKeys = {
  shiftStartPresenceMode: "startModeOverride",
  shiftEndPresenceMode: "endModeOverride",
  shiftPresenceMaxAccuracyMeters: "maxAccuracyMetersOverride",
  shiftPresenceMaxFixAgeSeconds: "maxFixAgeSecondsOverride",
} as const;

export function requirePresenceResultReady(
  policy: ShiftPresenceEffectivePolicy,
  usable: boolean,
  release = true,
) {
  if (
    ![policy.startMode, policy.endMode].some(
      (mode) => mode === "REQUIRE" || mode === "REQUIRE_OR_OVERRIDE",
    )
  )
    return;
  if (!usable) throw new PresenceManagementError("PRESENCE_NOT_READY");
  if (release)
    throw new PresenceManagementError("PRESENCE_STRICT_ROLLOUT_CLOSED");
}

async function writePolicy(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  actor: PresenceManagementActor,
  command: {
    field: ShiftPresenceField;
    value?: string | number;
    mutationId: string;
    expectedRevision: number;
  },
  clear: boolean,
  companyRevision: number,
) {
  const duplicate = await transaction.query(
    `SELECT id FROM audit_events WHERE id=$1`,
    [command.mutationId],
  );
  if (duplicate.rowCount !== 0)
    throw new PresenceManagementError("PRESENCE_MUTATION_CONFLICT");
  await requireMfaAssuranceInTransaction(transaction, context, {
    sensitive: true,
  });
  await transaction.query(
    `SELECT shift_presence_set_policy($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      actor.userId,
      actor.membershipId,
      context.staffAuthSessionId,
      context.accessTokenHash,
      actor.organizationId,
      actor.locationId,
      command.field,
      clear ? null : String(command.value),
      clear,
      command.expectedRevision,
      companyRevision,
      command.mutationId,
    ],
  );
}

export async function setPresenceCompanyPolicy(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  actor: PresenceManagementActor,
  command: ShiftPresenceCompanySetRequest,
) {
  const before = await presenceCompanyPolicy(transaction, actor.organizationId);
  if (before.revision !== command.expectedRevision)
    throw new PresenceManagementError("PRESENCE_CONFIGURATION_CONFLICT");
  const candidate = { ...before, [fieldKeys[command.field]]: command.value };
  // Complete fanout, including inactive setup targets. Never rely on a Dashboard page.
  const locations = await transaction.query<{ id: string }>(
    `SELECT id::text FROM locations WHERE organization_id=$1 ORDER BY id`,
    [actor.organizationId],
  );
  let strict = false;
  for (const location of locations.rows) {
    const projection = await presenceLocationPolicy(
      transaction,
      actor.organizationId,
      location.id,
    );
    const resulting = resolveShiftPresencePolicy(
      candidate,
      projection.overrides,
    );
    requirePresenceResultReady(
      resulting,
      projection.readiness.configurationUsable,
      false,
    );
    strict ||= [resulting.startMode, resulting.endMode].some(
      (mode) => mode === "REQUIRE" || mode === "REQUIRE_OR_OVERRIDE",
    );
  }
  if (
    strict ||
    [candidate.startMode, candidate.endMode].some(
      (mode) => mode === "REQUIRE" || mode === "REQUIRE_OR_OVERRIDE",
    )
  ) {
    throw new PresenceManagementError("PRESENCE_STRICT_ROLLOUT_CLOSED");
  }
  await writePolicy(
    transaction,
    context,
    actor,
    command,
    false,
    before.revision,
  );
  return {
    organizationId: actor.organizationId,
    policy: await presenceCompanyPolicy(transaction, actor.organizationId),
    capabilities: { canEdit: true, strictActivationAllowed: false as const },
  };
}

export async function changePresenceLocationPolicy(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  actor: PresenceManagementActor,
  command: ShiftPresenceLocationSetRequest | ShiftPresenceLocationClearRequest,
) {
  const before = await presenceLocationPolicy(
    transaction,
    actor.organizationId,
    actor.locationId!,
  );
  if (before.overrides.revision !== command.expectedRevision)
    throw new PresenceManagementError("PRESENCE_CONFIGURATION_CONFLICT");
  if (
    before.company.revision !== command.expectedCompanyRevision ||
    before.readiness.configurationFingerprint !==
      command.configurationFingerprint
  ) {
    throw new PresenceManagementError("PRESENCE_INHERITED_CONTEXT_CONFLICT");
  }
  const clear = !("value" in command);
  const overrides = {
    ...before.overrides,
    [overrideKeys[command.field]]: clear ? null : command.value,
  };
  const effective = resolveShiftPresencePolicy(before.company, overrides);
  requirePresenceResultReady(effective, before.readiness.configurationUsable);
  await writePolicy(
    transaction,
    context,
    actor,
    command,
    clear,
    before.company.revision,
  );
  return presenceLocationPolicy(
    transaction,
    actor.organizationId,
    actor.locationId!,
  );
}
