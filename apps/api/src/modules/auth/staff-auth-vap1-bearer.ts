import { timingSafeEqual } from "node:crypto";

import { UnauthorizedException } from "@nestjs/common";

import {
  accessBearerPattern,
  accessTokenPattern,
} from "./staff-auth-credential";
import type { StaffSessionContext } from "./staff-session-context";

/**
 * Only a submitted raw Bearer can witness possession of this context's hash.
 * This is deliberately NOT sufficient to sign a VAP1 command: its SQL writer
 * must still lock/recheck current session, User, admission and purpose scope.
 */
export function requireRequestBearerPossession(
  authorization: string | undefined,
  context: Pick<StaffSessionContext, "rawAccessToken">,
): void {
  const raw =
    typeof authorization === "string"
      ? accessBearerPattern.exec(authorization)?.[1]
      : undefined;
  if (!raw || !accessTokenPattern.test(raw)) {
    throw new UnauthorizedException();
  }
  const expectedRaw = context.rawAccessToken;
  if (expectedRaw === undefined || !accessTokenPattern.test(expectedRaw)) {
    throw new UnauthorizedException();
  }
  const actual = Buffer.from(raw, "ascii");
  const expected = Buffer.from(expectedRaw, "ascii");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new UnauthorizedException();
  }
}
