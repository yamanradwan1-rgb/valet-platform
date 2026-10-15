import { randomUUID } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";

import {
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import type {
  StaffSessionContext,
  StaffSessionContextResolver,
} from "../src/modules/auth/staff-session-context";
import type { ShiftTestContext } from "./shift-test-context";

/** Supplies real session rows for the shared fixture's synthetic HTTP principals. */
export function createCancelCheckInCredentialFixture(context: ShiftTestContext) {
  const contexts = new Map<string, StaffSessionContext>();
  const resolver: StaffSessionContextResolver = {
    async resolve(authorization) {
      const credential = authorization && contexts.get(authorization);
      if (!credential) throw new UnauthorizedException();
      return credential;
    },
  };

  return {
    resolver,
    async register(userId: string, token: string) {
      const id = randomUUID();
      const row = await context.adminPool.query<{ created_at: Date }>(
        `WITH stamp AS (SELECT clock_timestamp() AS at)
         INSERT INTO staff_auth_sessions
           (id, user_id, current_access_token_hash, created_at,
            last_rotated_at, access_expires_at, absolute_expires_at)
         SELECT $1, $2, $3, at, at,
                at + INTERVAL '15 minutes', at + INTERVAL '1 day'
         FROM stamp RETURNING created_at`,
        [id, userId, staffCredentialHash("access", token)],
      );
      contexts.set(`Bearer ${token}`, {
        accessTokenHash: staffCredentialHash("access", token),
        createdAt: row.rows[0]!.created_at,
        staffAuthSessionId: id,
        userId,
      });
    },
  };
}
