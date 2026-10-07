import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { GuestSessionReadResponse } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import { resolveGuestSessionById } from "../valet-sessions/guest-access-resolver";
import {
  resolveAndLockGuestSessionById,
  type LockedGuestAccessSessionScope,
} from "../valet-sessions/guest-access-session-resolution";
import type {
  GuestAuthorityScope,
  GuestCredentialResolution,
} from "./guest-credential";

const secretEntropyBytes = 32;
const secretBodyPattern = /^[A-Za-z0-9_-]{43}$/;

interface BrowserResolveRow {
  readonly authority_scope: GuestAuthorityScope | null;
  readonly credential_generation: number | null;
  readonly result_code: string;
  readonly valet_session_id: string | null;
}

function mintSecret(prefix: "vge1." | "vgb1."): string {
  const body = randomBytes(secretEntropyBytes).toString("base64url");
  if (!secretBodyPattern.test(body)) {
    throw new Error("Guest Browser Session secret generation failed.");
  }
  return `${prefix}${body}`;
}

function invalidAccess(): never {
  throw new GuestAccessError("GUEST_ACCESS_INVALID");
}

@Injectable()
export class GuestBrowserSessionService {
  enrollmentEnabled(): boolean {
    return process.env.GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED === "true";
  }

  async enrollInTransaction(transaction: PostgresTransaction): Promise<{
    readonly browserSecret: string;
    readonly enrollmentSecret: string;
  }> {
    if (!this.enrollmentEnabled()) return invalidAccess();
    const enrollmentSecret = mintSecret("vge1.");
    const browserSecret = mintSecret("vgb1.");
    const result = await transaction.query<{ result_code: string }>(
      `SELECT result_code FROM public.guest_browser_enroll($1, $2)`,
      [enrollmentSecret, browserSecret],
    );
    if (result.rows[0]?.result_code !== "OK") {
      throw new Error("Guest Browser Session enrollment failed closed.");
    }
    return { browserSecret, enrollmentSecret };
  }

  async exchangeInTransaction(
    transaction: PostgresTransaction,
    guestBearer: string,
    enrollmentSecret: string,
    browserSecret: string,
  ): Promise<void> {
    const result = await transaction.query<{
      result_code: string;
      valet_session_id: string | null;
    }>(
      `SELECT result_code, valet_session_id::text
       FROM public.guest_browser_exchange($1, $2, $3)`,
      [guestBearer, enrollmentSecret, browserSecret],
    );
    const row = result.rows[0];
    if (
      row === undefined ||
      !["AUTHORIZED", "RECOVERED"].includes(row.result_code) ||
      row.valet_session_id === null
    ) {
      return invalidAccess();
    }
  }

  async endInTransaction(
    transaction: PostgresTransaction,
    browserSecret: string,
  ): Promise<boolean> {
    const result = await transaction.query<{ result_code: string }>(
      `SELECT public.guest_browser_end($1) AS result_code`,
      [browserSecret],
    );
    return result.rows[0]?.result_code === "ENDED";
  }

  async hasAuthorizedSessionInTransaction(
    transaction: PostgresTransaction,
    browserSecret: string,
  ): Promise<boolean> {
    const result = await transaction.query<BrowserResolveRow>(
      `SELECT result_code, valet_session_id::text, authority_scope,
              credential_generation
       FROM public.guest_browser_resolve($1, TRUE)`,
      [browserSecret],
    );
    return result.rows[0]?.result_code === "OK";
  }

  async resolveReadInTransaction(
    transaction: PostgresTransaction,
    browserSecret: string,
  ): Promise<GuestCredentialResolution<GuestSessionReadResponse>> {
    const authority = await this.resolveAuthority(
      transaction,
      browserSecret,
      true,
    );
    const session = await resolveGuestSessionById(
      transaction,
      authority.valetSessionId,
    );
    return { scope: authority.scope, session };
  }

  async resolveLockedInTransaction(
    transaction: PostgresTransaction,
    browserSecret: string,
    allowPostVisit: boolean,
  ): Promise<GuestCredentialResolution<LockedGuestAccessSessionScope>> {
    const authority = await this.resolveAuthority(
      transaction,
      browserSecret,
      allowPostVisit,
    );
    const session = await resolveAndLockGuestSessionById(
      transaction,
      authority.valetSessionId,
    );
    return { scope: authority.scope, session };
  }

  private async resolveAuthority(
    transaction: PostgresTransaction,
    browserSecret: string,
    allowPostVisit: boolean,
  ): Promise<{
    readonly scope: GuestAuthorityScope;
    readonly valetSessionId: string;
  }> {
    const result = await transaction.query<BrowserResolveRow>(
      `SELECT result_code, valet_session_id::text, authority_scope,
              credential_generation
       FROM public.guest_browser_resolve($1, $2)`,
      [browserSecret, allowPostVisit],
    );
    const row = result.rows[0];
    if (
      row?.result_code !== "OK" ||
      row.valet_session_id === null ||
      (row.authority_scope !== "ACTIVE" &&
        row.authority_scope !== "POST_VISIT") ||
      row.credential_generation === null
    ) {
      return invalidAccess();
    }
    return { scope: row.authority_scope, valetSessionId: row.valet_session_id };
  }
}
