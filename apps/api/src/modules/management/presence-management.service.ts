import { readPresenceManagementResult } from "./presence-management-result";
import {
  recordPresenceManagementMutation,
  type PresenceMutationIdentity,
} from "./presence-management-mutation";
import { Inject, Injectable } from "@nestjs/common";
import type {
  ShiftPresenceCompanySetRequest,
  ShiftPresenceLocationSetRequest,
  ShiftPresenceLocationClearRequest,
  ShiftPresenceZoneCreateRequest,
  ShiftPresenceZoneUpdateRequest,
  ShiftPresenceManagementResultQuery,
} from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  recordAdminActivityInTransaction,
  requireMfaAssuranceInTransaction,
} from "../auth/mfa/mfa-assurance-policy";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { UnauthorizedException } from "@nestjs/common";
import {
  protectPresenceManagementAuthority,
  type PresenceManagementActor,
  type PresenceManagementTarget,
} from "./presence-management-authority";
import {
  presenceCompanyPolicy,
  presenceLocationPolicy,
} from "./presence-management-projection";
import {
  setPresenceCompanyPolicy,
  changePresenceLocationPolicy,
} from "./presence-management-policy-command";
import {
  readPresenceZone,
  listPresenceZones,
  writePresenceZone,
} from "./presence-management-zone-command";
import {
  readManagementPresenceException,
  listManagementPresenceExceptions,
  reviewManagementPresenceException,
} from "./presence-management-exception";
import { PresenceManagementError } from "./presence-management-errors";
import { ShiftPresenceError } from "../shifts/shift-presence-errors";
import { ManagementAccessDeniedError } from "./management-authorization";

@Injectable()
export class PresenceManagementService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  private async run<T>(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    mutation: boolean,
    configurationWriter: boolean,
    operation: (
      transaction: PostgresTransaction,
      actor: PresenceManagementActor,
    ) => Promise<T>,
    identity?: Omit<PresenceMutationIdentity, "entityId"> & {
      readonly entityId?: string;
    },
  ): Promise<T> {
    try {
      return await inPostgresTransaction(this.pool, async (transaction) => {
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
      const database = error as { code?: string; constraint?: string };
      if (database.code === "55P03" || database.code === "40P01")
        throw new ShiftPresenceError("PRESENCE_AUTHORITY_BUSY");
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
    }
  }

  company(context: StaffSessionContext, target: PresenceManagementTarget) {
    return this.run(context, target, false, false, async (tx, actor) => ({
      organizationId: actor.organizationId,
      policy: await presenceCompanyPolicy(tx, actor.organizationId),
      capabilities: { canEdit: true, strictActivationAllowed: true as const },
    }));
  }
  location(context: StaffSessionContext, target: PresenceManagementTarget) {
    return this.run(context, target, false, false, (tx, actor) =>
      presenceLocationPolicy(tx, actor.organizationId, actor.locationId!),
    );
  }
  setCompany(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    command: ShiftPresenceCompanySetRequest,
  ) {
    return this.run(
      context,
      target,
      true,
      true,
      (tx, actor) => setPresenceCompanyPolicy(tx, context, actor, command),
      { mutationId: command.mutationId, kind: "COMPANY_POLICY" },
    );
  }
  changeLocation(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    command:
      ShiftPresenceLocationSetRequest | ShiftPresenceLocationClearRequest,
  ) {
    return this.run(
      context,
      target,
      true,
      true,
      (tx, actor) => changePresenceLocationPolicy(tx, context, actor, command),
      { mutationId: command.mutationId, kind: "LOCATION_POLICY" },
    );
  }
  zones(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    query: { limit: number; cursor?: string | undefined },
  ) {
    return this.run(context, target, false, false, (tx, actor) =>
      listPresenceZones(tx, actor, query),
    );
  }
  zone(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    zoneId: string,
  ) {
    return this.run(context, target, false, false, async (tx, actor) => ({
      zone: await readPresenceZone(tx, actor, zoneId),
      readiness: (
        await presenceLocationPolicy(
          tx,
          actor.organizationId,
          actor.locationId!,
        )
      ).readiness,
    }));
  }
  saveZone(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    command: ShiftPresenceZoneCreateRequest | ShiftPresenceZoneUpdateRequest,
    zoneId?: string,
  ) {
    return this.run(
      context,
      target,
      true,
      true,
      (tx, actor) => writePresenceZone(tx, context, actor, command, zoneId),
      {
        mutationId: command.mutationId,
        kind: "ZONE",
        entityId: "zoneId" in command ? command.zoneId : zoneId!,
      },
    );
  }
  exceptions(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    query: {
      view: "PENDING" | "HISTORY";
      limit: number;
      cursor?: string | undefined;
    },
  ) {
    return this.run(context, target, false, false, (tx, actor) =>
      listManagementPresenceExceptions(tx, actor, query),
    );
  }
  exception(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    exceptionId: string,
  ) {
    return this.run(context, target, false, false, (tx, actor) =>
      readManagementPresenceException(tx, actor, exceptionId),
    );
  }
  review(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    exceptionId: string,
    command: { expectedRevision: number; mutationId: string },
    action: "APPROVED" | "REJECTED",
  ) {
    return this.run(
      context,
      target,
      true,
      false,
      (tx, actor) =>
        reviewManagementPresenceException(
          tx,
          context,
          actor,
          exceptionId,
          command,
          action,
        ),
      {
        mutationId: command.mutationId,
        kind: "EXCEPTION",
        entityId: exceptionId,
      },
    );
  }
  result(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    mutationId: string,
    query: ShiftPresenceManagementResultQuery = { kind: "POLICY" },
  ) {
    return this.run(context, target, false, false, async (tx, actor) => {
      return readPresenceManagementResult(tx, actor, mutationId, query);
    });
  }
}
