import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20261008007800_guest_web_push_v1/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const apiPrivileges = readFileSync(
  new URL("../scripts/guest-push-runtime-privileges.mjs", import.meta.url),
  "utf8",
);
const workerPrivileges = readFileSync(
  new URL("../scripts/guest-push-worker-runtime-privileges.mjs", import.meta.url),
  "utf8",
);
const workerProvisioning = readFileSync(
  new URL("../scripts/provision-guest-push-worker-role.mjs", import.meta.url),
  "utf8",
);

describe("T5 Guest Web Push migration contract", () => {
  it("creates three dedicated persistence tables and logical uniqueness", () => {
    for (const table of [
      "guest_push_registrations",
      "guest_push_intents",
      "guest_push_deliveries",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
    expect(migration).toContain("guest_push_registrations_active_browser_session_key");
    expect(migration).toContain("guest_push_registrations_active_endpoint_hash_key");
    expect(migration).toContain("guest_push_intents_kind_session_ready_at_key");
    expect(migration).toContain("guest_push_deliveries_intent_registration_key");
  });

  it("derives registration scope from current Browser Session and effective policy", () => {
    expect(migration).toContain("guest_browser_resolve(p_browser_token, FALSE)");
    expect(migration).toContain("session.customer_access_generation = v_generation");
    expect(migration).toContain("session.customer_access_revoked_at IS NULL");
    expect(migration).toContain("organization.status = 'ACTIVE'");
    expect(migration).toContain("location.status = 'ACTIVE'");
    expect(migration).toContain(
      "location.guest_vehicle_ready_notification_enabled_override",
    );
    expect(migration).toContain("organization.guest_vehicle_ready_notification_enabled");
    expect(migration).toContain("fcm\\.googleapis\\.com");
    expect(migration).toContain("\\.push\\.apple\\.com");
    expect(migration).toContain("pg_advisory_xact_lock(v_lock_a)");
    expect(migration).toContain("pg_advisory_xact_lock(v_lock_b)");
    expect(migration).toContain("pg_catalog.sha256(pg_catalog.convert_to(p_endpoint, 'UTF8'))");
    expect(migration).not.toContain("digest(convert_to(p_endpoint");
  });

  it("uses PostgreSQL-valid subscription key regex limits matching the HTTP contract", () => {
    // PostgreSQL's ARE interval bounds cannot use 256 as a repetition maximum.
    expect(migration).toContain(
      "p_p256dh !~ '^[A-Za-z0-9_-]{80,128}={0,2}$'",
    );
    expect(migration).toContain(
      "p_auth !~ '^[A-Za-z0-9_-]{16,64}={0,2}$'",
    );
    expect(migration).not.toContain("{20,256}");
  });

  it("uses PostgreSQL-valid subscription key regex limits matching the HTTP contract", () => {
    // PostgreSQL's ARE interval bounds cannot use 256 as a repetition maximum.
    expect(migration).toContain(
      "p_p256dh !~ '^[A-Za-z0-9_-]{80,128}={0,2}$'",
    );
    expect(migration).toContain(
      "p_auth !~ '^[A-Za-z0-9_-]{16,64}={0,2}$'",
    );
    expect(migration).not.toContain("{20,256}");
  });

  it("binds READY intent creation to exact canonical READY state and generation", () => {
    expect(migration).toContain("CREATE FUNCTION public.guest_push_ready_intent_v1");
    expect(migration).toContain("session.state = 'READY'");
    expect(migration).toContain("session.ready_at = p_ready_at");
    expect(migration).toContain("registration.credential_generation = v_generation");
    expect(migration).toContain("browser.revoked_at IS NULL");
    expect(migration).toContain("p_ready_at + interval '30 minutes'");
    expect(migration).toContain("'PENDING', 0, 4, p_ready_at");
    expect(migration).not.toContain("customer_access_expires_at");
  });

  it("releases subscription secrets only through the leased delivery resolver", () => {
    expect(migration).toContain("CREATE FUNCTION public.guest_push_resolve_eligible_v1");
    expect(migration).toContain("delivery.state = 'LEASED'");
    expect(migration).toContain("delivery.lease_token = p_lease_token");
    expect(migration).toContain("browser.revoked_at IS NULL");
    expect(migration).toContain(
      "session.customer_access_generation = registration.credential_generation",
    );
    expect(migration).toContain("session.customer_access_revoked_at IS NULL");
    expect(migration).not.toContain("customer_access_expires_at");
  });

  it("keeps ordinary API runtime away from worker tables and secret resolver", () => {
    expect(apiPrivileges).toContain(
      '"public.guest_push_register_v1(text,text,text,text,text)"',
    );
    expect(apiPrivileges).toContain(
      '"public.guest_push_ready_intent_v1(uuid,uuid,uuid,timestamp with time zone)"',
    );
    expect(apiPrivileges).toContain(
      '"public.guest_push_resolve_eligible_v1(uuid,uuid,integer)"',
    );
    expect(apiPrivileges).toContain('"public.cleanup_guest_push_v1()"');
    expect(apiPrivileges).toContain('[table, privilege, false]');
    expect(apiPrivileges).toContain(
      "API runtime has Guest Push worker-only authority.",
    );
  });

  it("gives the separate worker only sender authority and no registration commands", () => {
    expect(workerPrivileges).toContain(
      '"public.guest_push_resolve_eligible_v1(uuid,uuid,integer)"',
    );
    expect(workerPrivileges).toContain(
      '"public.guest_push_reconcile_ended_v1(integer)"',
    );
    expect(workerPrivileges).toContain('"public.cleanup_guest_push_v1()"');
    expect(workerPrivileges).toContain(
      '"public.guest_push_register_v1(text,text,text,text,text)"',
    );
    expect(workerPrivileges).toContain(
      "Guest Push worker has forbidden API authority.",
    );
    expect(workerPrivileges).toContain(
      '["endpoint", "p256dh", "auth_secret", "endpoint_hash"]',
    );
  });

  it("provisions only a safe pre-existing worker role and never creates credentials", () => {
    expect(workerProvisioning).toContain(
      "readGuestPushWorkerProvisioningConfiguration(process.env)",
    );
    expect(workerProvisioning).not.toMatch(/CREATE ROLE|ALTER ROLE[^\n]*PASSWORD/i);
    expect(workerProvisioning).toContain("verifyGuestPushWorkerPrivileges");
    expect(workerProvisioning).toContain(
      "REVOKE ALL PRIVILEGES ON ALL ${objectType} IN SCHEMA public FROM %I",
    );
  });

  it("keeps retention deletion behind a bounded security-definer cleanup", () => {
    expect(migration).toContain("CREATE FUNCTION public.cleanup_guest_push_v1()");
    expect(migration).toContain("LIMIT 1000");
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.cleanup_guest_push_v1() FROM PUBLIC");
  });
});
