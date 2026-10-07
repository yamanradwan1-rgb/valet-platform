import { Inject, Injectable } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  createIssueGuestAccessCommandExecutor,
  createRevokeGuestAccessCommandExecutor,
  GuestAccessError,
  resolveGuestAccessWithDatabase,
  type IssueGuestAccessRequest,
  type StaffGuestAccessRequest,
} from "../valet-sessions/guest-access-command";
import { resolveAndLockGuestAccessSession } from "../valet-sessions/guest-access-session-resolution";
import { GuestBrowserSessionService } from "./guest-browser-session.service";
import type {
  GuestCredentialInput,
  GuestCredentialResolution,
} from "./guest-credential";
import { normalizeGuestCredential } from "./guest-credential";

@Injectable()
export class GuestAccessService {
  private readonly issueGuestAccess;
  private readonly revokeGuestAccess;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly browserSessions?: GuestBrowserSessionService,
  ) {
    this.issueGuestAccess = createIssueGuestAccessCommandExecutor(pool);
    this.revokeGuestAccess = createRevokeGuestAccessCommandExecutor(pool);
  }

  executeIssue(request: IssueGuestAccessRequest) {
    return this.issueGuestAccess(request);
  }

  executeRevoke(request: StaffGuestAccessRequest) {
    return this.revokeGuestAccess(request);
  }

  async resolveCredentialInTransaction(
    transaction: PostgresTransaction,
    credentialInput: GuestCredentialInput,
  ) {
    try {
      const credential = normalizeGuestCredential(credentialInput);
      if (credential.kind === "BROWSER_SESSION") {
        if (this.browserSessions === undefined) {
          throw new Error("Guest Browser Session service is unavailable.");
        }
        return await this.browserSessions.resolveReadInTransaction(
          transaction,
          credential.secret,
        );
      }
      const session = await resolveGuestAccessWithDatabase(
        transaction,
        credential.secret,
      );
      return {
        scope: session.state === "COMPLETED" ? "POST_VISIT" : "ACTIVE",
        session,
      } satisfies GuestCredentialResolution<typeof session>;
    } catch (error) {
      if (error instanceof GuestAccessError) return undefined;
      throw error;
    }
  }

  async resolveAndLockCredentialInTransaction(
    transaction: PostgresTransaction,
    credentialInput: GuestCredentialInput,
    allowPostVisit = false,
  ) {
    try {
      const credential = normalizeGuestCredential(credentialInput);
      if (credential.kind === "BROWSER_SESSION") {
        if (this.browserSessions === undefined) {
          throw new Error("Guest Browser Session service is unavailable.");
        }
        return await this.browserSessions.resolveLockedInTransaction(
          transaction,
          credential.secret,
          allowPostVisit,
        );
      }
      const session = await resolveAndLockGuestAccessSession(
        transaction,
        credential.secret,
      );
      const scope = session.state === "COMPLETED" ? "POST_VISIT" : "ACTIVE";
      if (scope === "POST_VISIT" && !allowPostVisit) return undefined;
      return { scope, session } as const;
    } catch (error) {
      if (error instanceof GuestAccessError) return undefined;
      throw error;
    }
  }
}
