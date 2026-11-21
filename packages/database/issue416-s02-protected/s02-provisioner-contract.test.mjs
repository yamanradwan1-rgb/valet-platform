import assert from "node:assert/strict";
import { test } from "node:test";
import { provisionMfaPrivileges } from "../scripts/mfa-runtime-privileges.mjs";
import {
  mfaProtectedWriterConfig,
  provisionMfaProtectedWriter,
} from "../scripts/mfa-protected-writer-privileges.mjs";
import {
  capture,
  has,
  protectedReadColumns,
  runtime,
  writer,
} from "./s02-provisioner-contract-fixture.mjs";

test("protected runtime grants exclude ALL factor and assurance origin DML", async () => {
  const { commands, client, formatted } = capture();
  await provisionMfaPrivileges(client, formatted, runtime, true);
  assert.equal(
    has(
      commands,
      "GRANT UPDATE (%I) ON TABLE %I TO %I",
      "mfa_authenticated_at",
    ),
    false,
  );
  assert.equal(
    has(commands, "GRANT UPDATE (%I) ON TABLE %I TO %I", "mfa_factor_id"),
    false,
  );
  assert.equal(
    has(
      commands,
      "GRANT UPDATE (%I) ON TABLE %I TO %I",
      "last_admin_activity_at",
    ),
    false,
  );
  for (const table of ["user_mfa_totp_factors", "mfa_recovery_codes"]) {
    assert.equal(
      commands.some(
        ({ sql, params }) => sql.startsWith("GRANT") && params?.[1] === table,
      ),
      false,
    );
  }
  assert.equal(has(commands, "REVOKE ALL ON TABLE staff_auth_sessions"), true);
});

test("legacy OFF mode preserves existing functional MFA grants", async () => {
  const { commands, client, formatted } = capture();
  await provisionMfaPrivileges(client, formatted, runtime, false);
  for (const column of ["mfa_authenticated_at", "mfa_factor_id"]) {
    assert.equal(
      has(commands, "GRANT UPDATE (%I) ON TABLE %I TO %I", column),
      true,
    );
  }
  assert.equal(
    has(commands, "GRANT INSERT (%I) ON TABLE %I TO %I", "protected_secret"),
    true,
  );
});

test("protected writer only receives purpose-specific MFA DML", async () => {
  const { commands, client, formatted } = capture();
  await provisionMfaProtectedWriter(
    client,
    formatted,
    writer,
    runtime,
    "admin",
  );
  assert.equal(has(commands, "CREATE ROLE %I WITH LOGIN"), true);
  assert.equal(
    has(commands, "GRANT UPDATE (runtime_lock_version) ON TABLE public.users"),
    true,
  );
  assert.equal(
    has(commands, "GRANT UPDATE (last_login_at) ON TABLE public.users"),
    false,
  );
  assert.equal(
    has(commands, "GRANT SELECT (%I) ON TABLE public.%I TO %I", "id"),
    true,
  );
  assert.equal(has(commands, "GRANT SELECT ON TABLE public.%I TO %I"), false);
  assert.equal(
    has(
      commands,
      "GRANT SELECT (%I) ON TABLE public.%I TO %I",
      "password_hash",
    ),
    false,
  );
  assert.equal(
    has(commands, "GRANT SELECT (%I) ON TABLE public.%I TO %I", "key_hash"),
    false,
  );
  for (const [table, columns] of Object.entries(protectedReadColumns)) {
    for (const column of columns) {
      assert.equal(
        commands.some(
          ({ sql, params }) =>
            sql === "GRANT SELECT (%I) ON TABLE public.%I TO %I" &&
            params?.[0] === column &&
            params?.[1] === table &&
            params?.[2] === writer.role,
        ),
        true,
        `missing exact MFA SELECT grant ${table}.${column}`,
      );
    }
  }
  assert.equal(
    commands.some(
      ({ sql, params }) =>
        sql === "GRANT SELECT (%I) ON TABLE public.%I TO %I" &&
        params?.[1] === "anti_abuse_events",
    ),
    false,
  );
  assert.equal(
    has(commands, "GRANT UPDATE (state) ON TABLE anti_abuse_events"),
    false,
  );
  assert.equal(
    has(commands, "GRANT EXECUTE ON FUNCTION public.s04_mfa_success"),
    true,
  );
  assert.equal(
    has(
      commands,
      "GRANT EXECUTE ON FUNCTION public.append_runtime_account_security_audit_event",
    ),
    true,
  );
  assert.equal(
    has(
      commands,
      "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC",
    ),
    true,
  );
  assert.equal(
    has(commands, "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I"),
    true,
  );
  assert.equal(
    has(
      commands,
      "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I",
    ),
    true,
  );
  assert.equal(
    has(
      commands,
      "REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA %I FROM %I",
    ),
    true,
  );
  assert.equal(
    commands.some(({ sql }) =>
      /GRANT UPDATE \(password_hash\)|GRANT UPDATE \(role\)|GRANT UPDATE \(status\)/.test(
        sql,
      ),
    ),
    false,
  );
  assert.equal(
    commands.some(
      ({ sql, params }) =>
        sql === "GRANT UPDATE (%I) ON TABLE public.%I TO %I" &&
        params?.[0] === "revoked_at" &&
        params?.[1] === "staff_auth_sessions",
    ),
    false,
  );
  assert.equal(has(commands, "GRANT CREATE"), false);
});

test("protected writer provisioning is repeatable and revokes stale role grants", async () => {
  const { commands, client, formatted } = capture({
    existingWriter: true,
    inheritedRoles: ["stale_parent"],
    delegatedRoles: ["stale_member"],
  });
  await provisionMfaProtectedWriter(
    client,
    formatted,
    writer,
    runtime,
    "admin",
  );
  await provisionMfaProtectedWriter(
    client,
    formatted,
    writer,
    runtime,
    "admin",
  );
  assert.equal(
    commands.filter(({ sql }) => sql.includes("ALTER ROLE %I WITH LOGIN"))
      .length,
    2,
  );
  assert.equal(
    commands.some(
      ({ sql, params }) =>
        sql === "REVOKE %I FROM %I" &&
        params?.[0] === "stale_parent" &&
        params?.[1] === writer.role,
    ),
    true,
  );
  assert.equal(
    commands.some(
      ({ sql, params }) =>
        sql === "REVOKE %I FROM %I" &&
        params?.[0] === writer.role &&
        params?.[1] === "stale_member",
    ),
    true,
  );
  assert.equal(
    commands.filter(({ sql }) =>
      sql.includes("GRANT UPDATE (runtime_lock_version) ON TABLE public.users"),
    ).length,
    2,
  );
});

test("protected MFA requires independent credentials to the same DB", () => {
  const base = {
    DATABASE_URL:
      "postgresql://s02_runtime:test-runtime@127.0.0.1:55033/s02_test_db",
    MFA_PROTECTED_WRITER_ENABLED: "true",
  };
  assert.throws(() => mfaProtectedWriterConfig(base), /dedicated writer/);
  assert.throws(
    () =>
      mfaProtectedWriterConfig({
        ...base,
        MFA_WRITER_DATABASE_URL: base.DATABASE_URL,
      }),
    /isolated same-DB/,
  );
  assert.throws(
    () =>
      mfaProtectedWriterConfig({
        ...base,
        MFA_WRITER_DATABASE_URL:
          "postgresql://s02_writer:test-writer@127.0.0.1:55034/s02_test_db",
      }),
    /isolated same-DB/,
  );
  assert.deepEqual(
    mfaProtectedWriterConfig({
      ...base,
      MFA_WRITER_DATABASE_URL:
        "postgresql://s02_writer:test-writer@127.0.0.1:55033/s02_test_db",
    }),
    { role: "s02_writer", password: "test-writer" },
  );
});
