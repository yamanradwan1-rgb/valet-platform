import { Inject, Injectable } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  createGuestAccessResolver,
  createIssueGuestAccessCommandExecutor,
  createRevokeGuestAccessCommandExecutor,
  GuestAccessError,
  resolveGuestAccessWithDatabase,
  type IssueGuestAccessRequest,
  type StaffGuestAccessRequest,
} from "../valet-sessions/guest-access-command";
import { resolveGuestAccessForUpdateWithDatabase } from "./guest-access-locked-resolution";

@Injectable()
export class GuestAccessService {
  private readonly issueGuestAccess;
  private readonly resolveGuestAccess;
  private readonly revokeGuestAccess;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {
    this.issueGuestAccess = createIssueGuestAccessCommandExecutor(pool);
    this.resolveGuestAccess = createGuestAccessResolver(pool);
    this.revokeGuestAccess = createRevokeGuestAccessCommandExecutor(pool);
  }

  executeIssue(request: IssueGuestAccessRequest) {
    return this.issueGuestAccess(request);
  }

  executeRevoke(request: StaffGuestAccessRequest) {
    return this.revokeGuestAccess(request);
  }

  resolve(rawToken: string) {
    return this.resolveGuestAccess(rawToken);
  }

  resolveInTransaction(
    transaction: PostgresTransaction,
    rawToken: string,
  ) {
    return this.resolveSafely(() =>
      resolveGuestAccessWithDatabase(transaction, rawToken),
    );
  }

  resolveForUpdateInTransaction(
    transaction: PostgresTransaction,
    rawToken: string,
  ) {
    return this.resolveSafely(() =>
      resolveGuestAccessForUpdateWithDatabase(transaction, rawToken),
    );
  }

  private async resolveSafely<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof GuestAccessError) return undefined;
      throw error;
    }
  }
}
