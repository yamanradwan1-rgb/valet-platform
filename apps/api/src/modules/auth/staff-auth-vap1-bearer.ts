import { timingSafeEqual } from "node:crypto";

import { UnauthorizedException } from "@nestjs/common";

import {
  accessBearerPattern,
  accessTokenPattern,
  staffCredentialHash,
} from "./staff-auth-credential";
import type { StaffSessionContext } from "./staff-session-context";

const accessHashPattern = /^staff-access-sha256:v1:[0-9a-f]{64}$/;

/**
 * Only a submitted raw Bearer can witness possession of this context's hash.
 * This is deliberately NOT sufficient to sign a VAP1 command: its SQL writer
 * must still lock/recheck current session, User, admission and purpose scope.
 */
export function requireRequestBearerPossession(
  authorization: string | undefined,
  context: Pick<StaffSessionContext, "accessTokenHash">,
): void {
  const raw =
    typeof authorization === "string"
      ? accessBearerPattern.exec(authorization)?.[1]
      : undefined;
  if (!raw || !accessTokenPattern.test(raw)) {
    throw new UnauthorizedException();
  }
  const expectedHash = context.accessTokenHash;
  if (!accessHashPattern.test(expectedHash)) {
    throw new UnauthorizedException();
  }
  const actual = Buffer.from(staffCredentialHash("access", raw), "ascii");
  const expected = Buffer.from(expectedHash, "ascii");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new UnauthorizedException();
  }
}
