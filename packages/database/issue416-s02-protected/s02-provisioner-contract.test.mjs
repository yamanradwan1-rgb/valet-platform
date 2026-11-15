import assert from "node:assert/strict";
import { test } from "node:test";
import {
  provisionMfaPrivileges,
} from "../scripts/mfa-runtime-privileges.mjs";
import {
  mfaProtectedWriterConfig,
  provisionMfaProtectedWriter,
} from "../scripts/mfa-protected-writer-privileges.mjs";

const runtime = "s02_runtime";
const writer = {
  role: "s02_writer",
  password: "synthetic-test-secret-writer-123456",
};

function capture() {
  const commands = [];
  const client = {
    query: async (sql, params) => {
      commands.push({ sql, params });
      if (sql.includes("FROM pg_catalog.pg_roles")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("FROM pg_catalog.pg_auth_members")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("current_database()")) {
        return { rowCount: 1, rows: [{ db: "s02_test_db" }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const formatted = async (_client, sql, params) => {
    commands.push({ sql, params });
  };
  return { commands, client, formatted };
}

function has(commands, text, column) {
  return commands.some(({ sql, params }) =>
    sql.includes(text) && (column === undefined || params?.[0] === column)
  );
}

test("protected runtime grants exclude ALL factor and assurance origin DML", async () => {
  const { commands, client, formatted } = capture();
  await provisionMfaPrivileges(client, formatted, runtime, true);
  assert.equal(has(commands, "GRANT UPDATE (%I) ON TABLE %I TO %I", "mfa_authenticated_at"), false);
  assert.equal(has(commands, "GRANT UPDATE (%I) ON TABLE %I TO %I", "mfa_factor_id"), false);
  assert.equal(has(commands, "GRANT UPDATE (%I) ON TABLE %I TO %I", "last_admin_activity_at"), false);
  for (const table of ["user_mfa_totp_factors", "mfa_recovery_codes"]) {
    assert.equal(
      commands.some(({ sql, params }) =>
        sql.startsWith("GRANT") && params?.[1] === table),
      false,
    );
  }
  assert.equal(has(commands, "REVOKE ALL ON TABLE staff_auth_sessions"), true);
});

test("legacy OFF mode preserves existing functional MFA grants", async () => {
  const { commands, client, formatted } = capture();
  await provisionMfaPrivileges(client, formatted, runtime, false);
  for (const column of ["mfa_authenticated_at", "mfa_factor_id"]) {
    assert.equal(has(commands,"GRANT UPDATE (%I) ON TABLE %I TO %I",column),true);
  }
  assert.equal(has(commands,"GRANT INSERT (%I) ON TABLE %I TO %I","protected_secret"),true);
});

test("protected writer only receives purpose-specific MFA DML", async () => {
  const { commands, client, formatted } = capture();
  await provisionMfaProtectedWriter(client, formatted, writer, runtime, "admin");
  assert.equal(has(commands,"CREATE ROLE %I WITH LOGIN"),true);
  assert.equal(has(commands,"GRANT UPDATE (last_login_at) ON TABLE users"),true);
  assert.equal(has(commands,"GRANT UPDATE (state) ON TABLE anti_abuse_events"),false);
  assert.equal(has(commands,"GRANT EXECUTE ON FUNCTION public.s04_mfa_success"),true);
  assert.equal(has(commands,"GRANT EXECUTE ON FUNCTION append_runtime_account_security_audit_event"),true);
  assert.equal(commands.some(({ sql }) => /GRANT UPDATE \(password_hash\)|GRANT UPDATE \(role\)|GRANT UPDATE \(status\)/.test(sql)),false);
  assert.equal(has(commands,"GRANT CREATE"),false);
});

test("protected MFA requires independent credentials to the same DB", () => {
  const base = {
    DATABASE_URL: "postgresql://s02_runtime:test-runtime@127.0.0.1:55033/s02_test_db",
    MFA_PROTECTED_WRITER_ENABLED: "true",
  };
  assert.throws(() => mfaProtectedWriterConfig(base), /dedicated writer/);
  assert.throws(() => mfaProtectedWriterConfig({
    ...base, MFA_WRITER_DATABASE_URL: base.DATABASE_URL,
  }), /isolated same-DB/);
  assert.throws(() => mfaProtectedWriterConfig({
    ...base, MFA_WRITER_DATABASE_URL:
      "postgresql://s02_writer:test-writer@127.0.0.1:55034/s02_test_db",
  }), /isolated same-DB/);
  assert.deepEqual(mfaProtectedWriterConfig({
    ...base, MFA_WRITER_DATABASE_URL:
      "postgresql://s02_writer:test-writer@127.0.0.1:55033/s02_test_db",
  }), { role: "s02_writer", password: "test-writer" });
});
