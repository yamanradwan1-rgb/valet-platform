import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyOptionCCutoverLogins } from "./option-c-cutover-login-verification.mjs";

const database = "option_c";
const roleNames = [
  "runtime",
  "staff_writer",
  "mfa_writer",
  "management_writer",
];
const [runtimeIdentity, ...writerList] = roleNames.map((role) => ({
  database,
  role,
  password: `test-${role}`,
}));
const identities = {
  runtimeIdentity,
  writers: Object.fromEntries(
    writerList.map((identity) => [identity.role, identity]),
  ),
};

test("cutover probes every role and verifies production TLS before checking identity", async () => {
  const calls = [];
  const tls = { rejectUnauthorized: true };
  await verifyOptionCCutoverLogins(
    identities,
    { user: "migrator", database, ssl: tls },
    "production",
    (configuration) => {
      assert.equal(configuration.ssl, tls);
      assert.equal(configuration.password, `test-${configuration.user}`);
      calls.push(configuration.user);
      return {
        async connect() {},
        async query(sql) {
          if (sql.includes("pg_stat_ssl")) {
            return { rowCount: 1, rows: [{ ssl: true, version: "TLSv1.3" }] };
          }
          return {
            rowCount: 1,
            rows: [
              {
                database,
                principal: configuration.user,
                login: configuration.user,
                recovery: false,
              },
            ],
          };
        },
        async end() {
          calls.push(`closed:${configuration.user}`);
        },
      };
    },
  );
  assert.deepEqual(
    calls,
    roleNames.flatMap((role) => [role, `closed:${role}`]),
  );
});

test("bad login stops cutover readiness without printing database credentials", async () => {
  const connected = [];
  const disconnected = [];
  await assert.rejects(
    verifyOptionCCutoverLogins(
      identities,
      { database },
      "test",
      ({ user }) => ({
        async connect() {
          connected.push(user);
          if (user === "mfa_writer")
            throw new Error("synthetic private details");
        },
        async query() {
          return {
            rowCount: 1,
            rows: [{ database, login: user, principal: user, recovery: false }],
          };
        },
        async end() {
          disconnected.push(user);
        },
      }),
    ),
    {
      message:
        "Option C cutover could not attest the configured mfa_writer login.",
    },
  );
  assert.deepEqual(connected, roleNames.slice(0, 3));
  assert.deepEqual(disconnected, connected);
});
