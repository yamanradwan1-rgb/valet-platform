import { readPresenceManagementResult } from "./presence-management-result";
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
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
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
import {
  runPresenceManagementTransaction,
  type PresenceManagementIdentity,
} from "./presence-management-transaction";
import type { PresenceManagementOperation } from "./presence-management-diagnostics";

@Injectable()
export class PresenceManagementService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  private run<T>(
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
    return runPresenceManagementTransaction(
      this.pool,
      name,
      context,
      target,
      mutation,
      configurationWriter,
      operation,
      identity,
    );
  }

  company(context: StaffSessionContext, target: PresenceManagementTarget) {
    return this.run(
      "COMPANY_POLICY_READ",
      context,
      target,
      false,
      false,
      async (tx, actor) => ({
        organizationId: actor.organizationId,
        policy: await presenceCompanyPolicy(tx, actor.organizationId),
        capabilities: { canEdit: true, strictActivationAllowed: true as const },
      }),
    );
  }
  location(context: StaffSessionContext, target: PresenceManagementTarget) {
    return this.run(
      "LOCATION_POLICY_READ",
      context,
      target,
      false,
      false,
      (tx, actor) =>
        presenceLocationPolicy(tx, actor.organizationId, actor.locationId!),
    );
  }
  setCompany(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    command: ShiftPresenceCompanySetRequest,
  ) {
    return this.run(
      "COMPANY_POLICY_SET",
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
      "LOCATION_POLICY_CHANGE",
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
    return this.run("ZONE_LIST", context, target, false, false, (tx, actor) =>
      listPresenceZones(tx, actor, query),
    );
  }
  zone(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    zoneId: string,
  ) {
    return this.run(
      "ZONE_READ",
      context,
      target,
      false,
      false,
      async (tx, actor) => ({
        zone: await readPresenceZone(tx, actor, zoneId),
        readiness: (
          await presenceLocationPolicy(
            tx,
            actor.organizationId,
            actor.locationId!,
          )
        ).readiness,
      }),
    );
  }
  saveZone(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    command: ShiftPresenceZoneCreateRequest | ShiftPresenceZoneUpdateRequest,
    zoneId?: string,
  ) {
    return this.run(
      "ZONE_SAVE",
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
    return this.run(
      "EXCEPTION_LIST",
      context,
      target,
      false,
      false,
      (tx, actor) => listManagementPresenceExceptions(tx, actor, query),
    );
  }
  exception(
    context: StaffSessionContext,
    target: PresenceManagementTarget,
    exceptionId: string,
  ) {
    return this.run(
      "EXCEPTION_READ",
      context,
      target,
      false,
      false,
      (tx, actor) => readManagementPresenceException(tx, actor, exceptionId),
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
      "EXCEPTION_REVIEW",
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
    return this.run(
      "RESULT_READ",
      context,
      target,
      false,
      false,
      async (tx, actor) => {
        return readPresenceManagementResult(tx, actor, mutationId, query);
      },
    );
  }
}
