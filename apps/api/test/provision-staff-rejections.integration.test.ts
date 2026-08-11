import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  input,
  passwordHash,
  persist,
  pool,
  scope,
  trackUser,
} from "./provision-staff.integration-fixture";

describe("controlled staff provisioning rejection and rollback", () => {
  it.each([
    ["inactive Organization", { organizationStatus: "INACTIVE" as const }],
    ["inactive Location", { locationStatus: "INACTIVE" as const }],
  ])("rejects %s without a User", async (_name, options) => {
    const target = await scope(options);
    const provisioning = input(target.organizationId, [target.locationId]);
    await expect(persist(provisioning)).rejects.toThrow("unavailable");
    const users = await pool.query("SELECT 1 FROM users WHERE email = $1", [
      provisioning.email.trim().toLowerCase(),
    ]);
    expect(users.rowCount).toBe(0);
  });

  it("rejects a missing Organization", async () => {
    const organizationId = randomUUID();
    const provisioning = input(organizationId, [randomUUID()]);
    await expect(persist(provisioning)).rejects.toThrow("Organization");
  });

  it("rejects a missing Location", async () => {
    const target = await scope();
    await expect(
      persist(input(target.organizationId, [randomUUID()])),
    ).rejects.toThrow("Locations");
  });

  it("rejects cross-Organization Location assignment", async () => {
    const target = await scope();
    const foreign = await scope();
    await expect(
      persist(input(target.organizationId, [foreign.locationId])),
    ).rejects.toThrow("Locations");
  });

  it("rejects an existing normalized email without mutation", async () => {
    const target = await scope();
    const existingUserId = randomUUID();
    trackUser(existingUserId);
    const email = `${randomUUID()}@example.com`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, $3, 'DISABLED', transaction_timestamp())`,
      [existingUserId, email, passwordHash],
    );
    await expect(
      persist(input(target.organizationId, [target.locationId]), email),
    ).rejects.toThrow("already exists");
    const memberships = await pool.query(
      "SELECT 1 FROM organization_memberships WHERE user_id = $1",
      [existingUserId],
    );
    expect(memberships.rowCount).toBe(0);
  });

  it("rolls back all inserts when AuditEvent insertion fails", async () => {
    const target = await scope();
    const provisioning = input(target.organizationId, [target.locationId], {
      auditLocationId: randomUUID(),
    });
    const email = provisioning.email.trim().toLowerCase();
    await expect(persist(provisioning, email)).rejects.toThrow(
      "Staff provisioning failed",
    );
    const facts = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users WHERE email = $1",
      [email],
    );
    expect(facts.rows[0]?.count).toBe("0");
  });

  it("concurrent duplicate email attempts leave exactly one User", async () => {
    const target = await scope();
    const email = `${randomUUID()}@example.com`;
    const attempts = await Promise.allSettled([
      persist(input(target.organizationId, [target.locationId]), email),
      persist(input(target.organizationId, [target.locationId]), email),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
    const users = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users WHERE email = $1",
      [email],
    );
    expect(users.rows[0]?.count).toBe("1");
  });
});
