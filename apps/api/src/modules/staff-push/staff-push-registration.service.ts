import { randomUUID } from "node:crypto";

import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type {
  StaffPushRegistrationRequest,
  StaffPushRegistrationResponse,
} from "@valet/contracts";

import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import {
  StaffPushRegistrationConflictError,
  StaffPushRegistrationNotAvailableError,
} from "./staff-push-registration-errors";
import {
  confirmRegistration,
  disableRegistration,
  findActiveRegistrations,
  findOwnedRegistration,
  insertRegistration,
  lockRegistrationKeys,
  supersedeRegistration,
} from "./staff-push-registration-repository";
import {
  staffPushLockKeys,
  staffPushTokenHash,
} from "./staff-push-registration-token";
import {
  safeRegistrationResponse,
  type ActiveRegistrationRow,
  type LockedStaffSessionRow,
} from "./staff-push-registration-types";

interface PostgresError {
  readonly code?: unknown;
}

function sessionIsLater(
  session: LockedStaffSessionRow,
  owner: ActiveRegistrationRow,
): boolean {
  const timeComparison =
    session.created_at.getTime() - owner.owner_created_at.getTime();
  return (
    timeComparison > 0 ||
    (timeComparison === 0 && session.id > owner.staff_auth_session_id)
  );
}

export function sessionMayReplaceOwner(
  session: LockedStaffSessionRow,
  owner: ActiveRegistrationRow,
): boolean {
  return (
    session.user_id === owner.owner_user_id &&
    sessionIsLater(session, owner)
  );
}

function safeRegistrationError(error: unknown): never {
  if ((error as PostgresError).code === "23505") {
    throw new StaffPushRegistrationConflictError();
  }
  throw error;
}

@Injectable()
export class StaffPushRegistrationService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessionResolver: StaffSessionContextResolver,
  ) {}

  async reconcile(
    authorization: string | undefined,
    input: StaffPushRegistrationRequest,
  ): Promise<StaffPushRegistrationResponse> {
    const context = await this.sessionResolver.resolve(authorization);
    const tokenHash = staffPushTokenHash(input.providerToken);
    try {
      return await inPostgresTransaction(this.pool, async (transaction) => {
        // Canonical order: current session, sorted logical keys, implicated rows.
        const session = await lockAndRecheckStaffSessionContext(
          transaction,
          context,
        );
        if (session === undefined) throw new UnauthorizedException();
        await lockRegistrationKeys(
          transaction,
          staffPushLockKeys({
            appIdentifier: input.appIdentifier,
            installationId: input.installationId,
            provider: input.provider,
            tokenHash,
          }),
        );
        const active = await findActiveRegistrations(
          transaction,
          input,
          tokenHash,
        );
        const tokenRegistration = active.find(
          (registration) => registration.token_hash === tokenHash,
        );
        if (
          tokenRegistration !== undefined &&
          tokenRegistration.installation_id !== input.installationId
        ) {
          throw new StaffPushRegistrationConflictError();
        }
        const installationRegistration = active.find(
          (registration) =>
            registration.installation_id === input.installationId &&
            registration.app_identifier === input.appIdentifier,
        );
        if (installationRegistration === undefined) {
          return safeRegistrationResponse(
            await insertRegistration(
              transaction,
              randomUUID(),
              session.id,
              input,
              tokenHash,
            ),
          );
        }
        if (installationRegistration.token_hash === tokenHash) {
          if (installationRegistration.staff_auth_session_id === session.id) {
            return safeRegistrationResponse(
              await confirmRegistration(
                transaction,
                installationRegistration.id,
                input,
              ),
            );
          }
          if (!sessionMayReplaceOwner(session, installationRegistration)) {
            throw new StaffPushRegistrationConflictError();
          }
          return this.replace(
            transaction,
            session.id,
            installationRegistration,
            input,
            tokenHash,
            "ACCOUNT_SWITCH",
          );
        }
        if (
          installationRegistration.staff_auth_session_id !== session.id &&
          !sessionMayReplaceOwner(session, installationRegistration)
        ) {
          throw new StaffPushRegistrationConflictError();
        }
        return this.replace(
          transaction,
          session.id,
          installationRegistration,
          input,
          tokenHash,
          "TOKEN_ROTATION",
        );
      });
    } catch (error) {
      return safeRegistrationError(error);
    }
  }

  async disable(
    authorization: string | undefined,
    registrationId: string,
  ): Promise<StaffPushRegistrationResponse> {
    const context = await this.sessionResolver.resolve(authorization);
    return inPostgresTransaction(this.pool, async (transaction) => {
      const session = await lockAndRecheckStaffSessionContext(
        transaction,
        context,
      );
      if (session === undefined) throw new UnauthorizedException();
      const registration = await findOwnedRegistration(
        transaction,
        registrationId,
        session.id,
      );
      if (registration === undefined) {
        throw new StaffPushRegistrationNotAvailableError();
      }
      if (registration.state === "DISABLED") {
        return safeRegistrationResponse(registration);
      }
      if (registration.state !== "ACTIVE") {
        throw new StaffPushRegistrationNotAvailableError();
      }
      return safeRegistrationResponse(
        await disableRegistration(transaction, registration.id),
      );
    });
  }

  private async replace(
    transaction: Parameters<typeof supersedeRegistration>[0],
    sessionId: string,
    prior: ActiveRegistrationRow,
    input: StaffPushRegistrationRequest,
    tokenHash: string,
    reason: "ACCOUNT_SWITCH" | "TOKEN_ROTATION",
  ): Promise<StaffPushRegistrationResponse> {
    const successorId = randomUUID();
    await supersedeRegistration(transaction, prior.id, successorId, reason);
    return safeRegistrationResponse(
      await insertRegistration(
        transaction,
        successorId,
        sessionId,
        input,
        tokenHash,
      ),
    );
  }
}
