import { createHmac } from "node:crypto";

import type { PoolClient } from "pg";

import { MANAGEMENT_DASHBOARD_E2E as f } from "./management-dashboard-e2e-config";

type FixtureAntiAbuseScope =
  | "v1:mfa-recovery-user"
  | "v1:mfa-totp-user"
  | "v1:staff-client-address"
  | "v1:staff-login-identifier";

function keyHash(scope: FixtureAntiAbuseScope, value: string): string {
  const encoded = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  if (!encoded || !/^[A-Za-z0-9_-]{43}$/u.test(encoded)) {
    throw new Error("Management Dashboard E2E requires the anti-abuse HMAC secret.");
  }
  const secret = Buffer.from(encoded, "base64url");
  if (secret.length !== 32 || secret.toString("base64url") !== encoded) {
    throw new Error("Management Dashboard E2E anti-abuse secret is malformed.");
  }
  const digest = createHmac("sha256", secret)
    .update(scope, "utf8")
    .update(Buffer.from([0]))
    .update(value, "utf8")
    .digest("hex");
  return `anti-abuse-hmac-sha256:v1:${digest}`;
}

export async function clearManagementDashboardE2eAntiAbuse(
  client: PoolClient,
): Promise<void> {
  const userIds = [...new Set(Object.values(f.users).map((user) => user.userId))];
  const entries: Array<readonly [FixtureAntiAbuseScope, string]> = [
    ...Object.values(f.users).map((user) =>
      ["v1:staff-login-identifier", user.email] as const),
    ...userIds.flatMap((userId) => [
      ["v1:mfa-totp-user", userId] as const,
      ["v1:mfa-recovery-user", userId] as const,
    ]),
    ...["127.0.0.1", "::1", "::ffff:127.0.0.1"].map((address) =>
      ["v1:staff-client-address", address] as const),
  ];
  for (const [scope, value] of entries) {
    await client.query(
      "DELETE FROM anti_abuse_events WHERE scope = $1 AND key_hash = $2",
      [scope, keyHash(scope, value)],
    );
  }
}
