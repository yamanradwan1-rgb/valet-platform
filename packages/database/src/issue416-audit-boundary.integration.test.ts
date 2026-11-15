import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Issue416AuditTestContext } from "./issue416-audit-test-context.js";

const context = new Issue416AuditTestContext();
const reservedTypes = [
  "STAFF_PASSWORD_RESET_LINK_ISSUED",
  "STAFF_PASSWORD_RESET_PASSWORD_CHANGED",
] as const;
const runtimeFunction =
  "public.append_runtime_account_security_audit_event(uuid,text,uuid,account_security_actor_type,uuid,timestamp with time zone)";
const privateFunction =
  "public.append_account_security_audit_event(uuid,text,uuid,account_security_actor_type,uuid,text,timestamp with time zone)";
const migrationUrl = new URL(
  "../prisma/migrations/20261113011200_issue416_reserved_security_audit/migration.sql",
  import.meta.url,
);

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.cleanup(), 60_000);

function append(
  eventType: string,
  actor: "USER" | "ANONYMOUS" | "SYSTEM" = "ANONYMOUS",
  id = randomUUID(),
  at = new Date(),
) {
  return context.runtime.query<{ id: string }>(
    `SELECT public.append_runtime_account_security_audit_event(
       $1,$2,$3,$4::public.account_security_actor_type,$5,$6)::text AS id`,
    [
      id,
      eventType,
      context.userId,
      actor,
      actor === "USER" ? context.userId : null,
      at,
    ],
  );
}

describe("Issue416 reserved security audit boundary", () => {
  it("accepts the standard owned CI target without connecting to it", async () => {
    vi.stubEnv(
      "TEST_DATABASE_URL",
      "postgresql://synthetic:synthetic@localhost:5432/valet",
    );
    try {
      const fixture = new Issue416AuditTestContext();
      expect(fixture.databaseName).toMatch(
        /^valet_issue416_audit_[0-9a-f]{32}$/,
      );
      await fixture.runtime.end();
      await fixture.admin.end();
      await fixture.bootstrap.end();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    "invalid database URL private-canary-416",
    "postgresql://synthetic:private-canary-416@localhost/test?host=remote.invalid",
    "postgresql://synthetic:private-canary-416@localhost/test#fragment",
  ])("rejects unsafe fixture target without disclosing its input", (target) => {
    vi.stubEnv("TEST_DATABASE_URL", target);
    try {
      expect(() => new Issue416AuditTestContext()).toThrowError(
        /^Issue416 (test database URL is invalid|requires the owned loopback PostgreSQL target)\.$/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each(reservedTypes)(
    "denies generic runtime append of %s without a row",
    async (eventType) => {
      const id = randomUUID();
      await expect(append(eventType, "USER", id)).rejects.toMatchObject({
        code: "42501",
      });
      await expect(append(eventType, "ANONYMOUS", id)).rejects.toMatchObject({
        code: "42501",
      });
      const rows = await context.admin.query(
        "SELECT id FROM public.account_security_audit_events WHERE id=$1",
        [id],
      );
      expect(rows.rowCount).toBe(0);
    },
  );

  it.each(reservedTypes)(
    "denies identical reserved-event replay for %s",
    async (eventType) => {
      const id = randomUUID();
      const at = new Date();
      // Trusted owner fixtures represent preexisting history. Runtime must
      // receive no replay disclosure through the generic append boundary.
      await context.admin.query(
        `SELECT public.append_account_security_audit_event(
         $1,$2,$3,'ANONYMOUS',NULL,NULL,$4)`,
        [id, eventType, context.userId, at],
      );
      await expect(
        append(eventType, "ANONYMOUS", id, at),
      ).rejects.toMatchObject({ code: "42501" });
      const rows = await context.admin.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM public.account_security_audit_events WHERE id=$1",
        [id],
      );
      expect(rows.rows[0]?.count).toBe(1);
    },
  );

  it("preserves MFA append, exact retry, conflict and transaction rollback", async () => {
    const id = randomUUID();
    const at = new Date();
    expect(
      (await append("MFA_TOTP_ACTIVATED", "USER", id, at)).rows[0]?.id,
    ).toBe(id);
    expect(
      (await append("MFA_TOTP_ACTIVATED", "USER", id, at)).rows[0]?.id,
    ).toBe(id);
    await expect(
      append("MFA_RECOVERY_CODE_USED", "USER", id, at),
    ).rejects.toMatchObject({ code: "23505" });
    const rollbackId = randomUUID();
    await context.runtime.query("BEGIN");
    await append("MFA_RECOVERY_CODE_USED", "USER", rollbackId);
    await context.runtime.query("ROLLBACK");
    const rows = await context.admin.query(
      "SELECT id FROM public.account_security_audit_events WHERE id=$1",
      [rollbackId],
    );
    expect(rows.rowCount).toBe(0);
  });

  it("retains ownership, fixed paths and private/PUBLIC privileges", async () => {
    context.provisionRuntime();
    const result = await context.admin.query(
      `SELECT p.oid::regprocedure::text AS signature, p.prosecdef,
              p.proconfig, owner.rolname <> $1 AS separate_owner,
              has_function_privilege($1,p.oid,'EXECUTE') AS runtime_allowed,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
                WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
              ) AS public_denied
       FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
       WHERE p.oid IN ($2::regprocedure,$3::regprocedure) ORDER BY p.proname`,
      [context.runtimeRole, privateFunction, runtimeFunction],
    );
    expect(result.rowCount).toBe(2);
    expect(result.rows.map((row) => row.runtime_allowed)).toEqual([
      false,
      true,
    ]);
    for (const row of result.rows) {
      expect(row.prosecdef && row.separate_owner && row.public_denied).toBe(
        true,
      );
      expect(row.proconfig).toEqual(["search_path=pg_catalog, public"]);
    }
    await expect(
      context.runtime.query(
        `SELECT public.append_account_security_audit_event(
         $1,$2,$3,'ANONYMOUS',NULL,NULL,clock_timestamp())`,
        [randomUUID(), reservedTypes[0], context.userId],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      context.runtime.query(
        `UPDATE public.users SET password_hash='synthetic-unusable-password' WHERE id=$1`,
        [context.userId],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      context.runtime.query(
        "SELECT id FROM public.account_security_audit_events LIMIT 1",
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("upgrades the prior wrapper transactionally and preserves history", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    const historical = await readFile(
      new URL(
        "../prisma/migrations/20260916003500_mgt_be_01_audit_foundation/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const start = historical.indexOf(
      'CREATE FUNCTION "append_runtime_account_security_audit_event"',
    );
    const oldWrapper = historical
      .slice(start)
      .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
    const before = await context.admin.query(
      "SELECT * FROM public.account_security_audit_events ORDER BY id",
    );
    try {
      await context.admin.query("BEGIN");
      await context.admin.query(oldWrapper);
      await context.admin.query(sql);
      for (const eventType of reservedTypes) {
        await context.admin.query("SAVEPOINT reserved_event_denial");
        await expect(
          context.admin.query(
            `SELECT public.append_runtime_account_security_audit_event(
               $1,$2,$3,'ANONYMOUS',NULL,clock_timestamp())`,
            [randomUUID(), eventType, context.userId],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await context.admin.query(
          "ROLLBACK TO SAVEPOINT reserved_event_denial",
        );
      }
      const after = await context.admin.query(
        "SELECT * FROM public.account_security_audit_events ORDER BY id",
      );
      expect(after.rows).toEqual(before.rows);
    } finally {
      await context.admin.query("ROLLBACK");
    }
    await expect(append(reservedTypes[0])).rejects.toMatchObject({
      code: "42501",
    });
  });
});
