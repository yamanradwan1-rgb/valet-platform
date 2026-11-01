import { performance } from "node:perf_hooks";
import { UnauthorizedException } from "@nestjs/common";
import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import {
  recordAdminActivityInTransaction,
  requireMfaAssuranceInTransaction,
} from "../auth/mfa/mfa-assurance-policy";
import {
  protectPresenceManagementAuthority,
  type PresenceManagementActor,
  type PresenceManagementTarget,
} from "./presence-management-authority";
import {
  recordPresenceManagementMutation,
  type PresenceMutationIdentity,
} from "./presence-management-mutation";
import { ManagementAccessDeniedError } from "./management-authorization";
import { PresenceManagementError } from "./presence-management-errors";
import {
  PresenceManagementBusyError,
  presenceManagementBusyOrigin,
  recordPresenceManagementBusy,
  type PresenceManagementBusyOrigin,
  type PresenceManagementOperation,
} from "./presence-management-diagnostics";
import {
  isRecoverablePresenceRead,
  recoverPresenceManagementRead,
} from "./presence-management-read-recovery";

export type PresenceManagementIdentity = Omit<
  PresenceMutationIdentity,
  "entityId"
> & {
  readonly entityId?: string;
};

export async function runPresenceManagementTransaction<T>(
  pool: PostgresPool,
  name: PresenceManagementOperation,
  context: StaffSessionContext,
  target: PresenceManagementTarget,
  mutation: boolean,
  configurationWriter: boolean,
  operation: (
    transaction: PostgresTransaction,
    actor: PresenceManagementActor,
  ) => Promise<T>,
  identity?: PresenceManagementIdentity,
): Promise<T> {
  const started = performance.now();
  let attempts = 0;
  let origin: PresenceManagementBusyOrigin | undefined;
  let outcome: "RECOVERED" | "DENIED" | "FAILED" = "FAILED";
  const attempt = async () => {
    attempts++;
    try {
      return await inPostgresTransaction(pool, async (transaction) => {
        const actor = await protectPresenceManagementAuthority(
          transaction,
          context,
          target,
          { mutation, configurationWriter },
        );
        const result =
          identity === undefined
            ? await operation(transaction, actor)
            : await recordPresenceManagementMutation(
                transaction,
                actor,
                {
                  ...identity,
                  entityId:
                    identity.entityId ??
                    actor.locationId ??
                    actor.organizationId,
                },
                () => operation(transaction, actor),
              );
        if (
          (await lockAndRecheckStaffSessionContext(transaction, context)) ===
          undefined
        )
          throw new UnauthorizedException();
        if (mutation)
          await requireMfaAssuranceInTransaction(transaction, context, {
            sensitive: true,
          });
        if (mutation || target.authority === "COMPANY_ADMIN")
          await recordAdminActivityInTransaction(transaction, context);
        return result;
      });
    } catch (error) {
      origin = presenceManagementBusyOrigin(error) ?? origin;
      throw error;
    }
  };
  try {
    // The explicit allowlist excludes every mutation, exception and result read.
    const result =
      !mutation && identity === undefined && isRecoverablePresenceRead(name)
        ? await recoverPresenceManagementRead(attempt)
        : await attempt();
    outcome = "RECOVERED";
    return result;
  } catch (error) {
    origin = presenceManagementBusyOrigin(error) ?? origin;
    const database = error as { code?: string; constraint?: string };
    if (
      error instanceof UnauthorizedException ||
      ["42501", "AUTHORIZATION_DENIED", "MFA_STEP_UP_REQUIRED"].includes(
        database.code ?? "",
      )
    )
      outcome = "DENIED";
    if (database.code === "55P03" || database.code === "40P01")
      throw new PresenceManagementBusyError(
        presenceManagementBusyOrigin(error)!,
      );
    if (database.code === "40001")
      throw new PresenceManagementError("PRESENCE_CONFIGURATION_CONFLICT");
    if (database.code === "42501") throw new ManagementAccessDeniedError();
    if (database.code === "23505")
      throw new PresenceManagementError("PRESENCE_MUTATION_CONFLICT");
    if (
      database.code === "23514" &&
      database.constraint?.startsWith("shift_presence")
    )
      throw new PresenceManagementError("PRESENCE_CONFIGURATION_CONFLICT");
    throw error;
  } finally {
    if (origin !== undefined)
      recordPresenceManagementBusy(
        name,
        origin,
        attempts,
        performance.now() - started,
        outcome,
      );
  }
}
