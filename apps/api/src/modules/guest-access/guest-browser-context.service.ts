import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type { PostgresTransaction } from "../../common/database/postgres";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import type { GuestAuthorityScope } from "./guest-credential";

const secretEntropyBytes = 32;
const secretBodyPattern = /^[A-Za-z0-9_-]{43}$/;

interface ContextPrepareRow {
  readonly authority_scope: GuestAuthorityScope | null;
  readonly browser_context_marker: string | null;
  readonly result_code: string;
}

interface ContextSwitchRow {
  readonly browser_context_marker: string | null;
  readonly result_code: string;
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
export class GuestBrowserContextService {
  enrollmentEnabled(): boolean {
    return process.env.GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED === "true";
  }

  async prepareInTransaction(
    transaction: PostgresTransaction,
    guestBearer: string,
    currentBrowserSecret?: string,
  ) {
    if (!this.enrollmentEnabled()) return invalidAccess();
    const enrollmentSecret = mintSecret("vge1.");
    const pendingBrowserSecret = mintSecret("vgb1.");
    const result = await transaction.query<ContextPrepareRow>(
      `SELECT result_code, authority_scope, browser_context_marker
       FROM public.guest_browser_prepare_context($1,$2,$3,$4)`,
      [
        guestBearer,
        currentBrowserSecret ?? null,
        enrollmentSecret,
        pendingBrowserSecret,
      ],
    );
    const row = result.rows[0];
    if (row?.result_code === "SAME_VISIT" && row.browser_context_marker !== null) {
      return { contextMarker: row.browser_context_marker, kind: "SAME_VISIT" } as const;
    }
    if (
      row?.result_code === "ENROLLMENT_READY" &&
      row.browser_context_marker !== null
    ) {
      return {
        browserSecret: pendingBrowserSecret,
        contextMarker: row.browser_context_marker,
        enrollmentSecret,
        kind: "ENROLLMENT_READY",
      } as const;
    }
    if (
      row?.result_code === "CONTEXT_CONFLICT" &&
      row.browser_context_marker !== null &&
      (row.authority_scope === "ACTIVE" || row.authority_scope === "POST_VISIT")
    ) {
      return {
        contextMarker: row.browser_context_marker,
        currentScope: row.authority_scope,
        enrollmentSecret,
        kind: "CONTEXT_CONFLICT",
        pendingBrowserSecret,
      } as const;
    }
    return invalidAccess();
  }

  async switchInTransaction(
    transaction: PostgresTransaction,
    guestBearer: string,
    currentBrowserSecret: string,
    enrollmentSecret: string,
    pendingBrowserSecret: string,
  ): Promise<{
    readonly contextMarker: string;
    readonly kind: "RECOVERED" | "SWITCHED";
  }> {
    const result = await transaction.query<ContextSwitchRow>(
      `SELECT result_code, browser_context_marker
       FROM public.guest_browser_switch_context($1,$2,$3,$4)`,
      [guestBearer, currentBrowserSecret, enrollmentSecret, pendingBrowserSecret],
    );
    const row = result.rows[0];
    if (
      (row?.result_code === "SWITCHED" || row?.result_code === "RECOVERED") &&
      row.browser_context_marker !== null
    ) {
      return { contextMarker: row.browser_context_marker, kind: row.result_code };
    }
    return invalidAccess();
  }

  async reconcileInTransaction(
    transaction: PostgresTransaction,
    currentBrowserSecret: string,
    enrollmentSecret: string,
    pendingBrowserSecret: string,
  ): Promise<
    | { readonly kind: "NONE" }
    | { readonly contextMarker: string; readonly kind: "RECOVERED" }
  > {
    const result = await transaction.query<{
      readonly browser_context_marker: string | null;
      readonly result_code: string;
    }>(
      `SELECT result_code, browser_context_marker
       FROM public.guest_browser_reconcile_switch($1,$2,$3)`,
      [currentBrowserSecret, enrollmentSecret, pendingBrowserSecret],
    );
    const row = result.rows[0];
    return row?.result_code === "RECOVERED" && row.browser_context_marker !== null
      ? { contextMarker: row.browser_context_marker, kind: "RECOVERED" }
      : { kind: "NONE" };
  }
}
