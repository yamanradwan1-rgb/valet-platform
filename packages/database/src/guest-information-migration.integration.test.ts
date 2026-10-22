import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  disposeIssue316,
  enabled,
  ids,
  initializeIssue316,
  owner,
  publish,
  role,
  runtime,
  savePrivacy,
} from "./guest-information-test-context.js";

beforeAll(initializeIssue316, 180_000);
afterAll(disposeIssue316, 60_000);

describe.skipIf(!enabled)(
  "Issue316 real PostgreSQL migration and runtime ACL",
  () => {
    it("keeps new configuration unseeded and denies runtime content DML", async () => {
      const empty = await owner.query(
        "SELECT count(*)::int AS total FROM guest_location_privacy",
      );
      expect(empty.rows[0]?.total).toBe(0);
      for (const table of [
        "guest_location_privacy",
        "guest_privacy_publications",
        "guest_contact_company_defaults",
        "guest_contact_location_overrides",
      ]) {
        const rights = await owner.query(
          `SELECT has_table_privilege($1,$2,'SELECT') AS readable,
                has_table_privilege($1,$2,'INSERT') AS insertable,
                has_table_privilege($1,$2,'UPDATE') AS updatable,
                has_table_privilege($1,$2,'DELETE') AS deletable`,
          [role, `public.${table}`],
        );
        expect(rights.rows[0]).toEqual({
          readable: true,
          insertable: false,
          updatable: false,
          deletable: false,
        });
      }
      await expect(
        runtime.query("DELETE FROM guest_location_privacy"),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("allows scoped Location Manager to draft/publish, never another Location", async () => {
      expect(await savePrivacy(ids.manager, ids.org, ids.first, 0)).toBe(1);
      await expect(
        savePrivacy(ids.manager, ids.org, ids.second, 0),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        savePrivacy(ids.outsider, ids.org, ids.first, 1),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        savePrivacy(ids.manager, ids.org, ids.first, 0),
      ).rejects.toMatchObject({ code: "40001" });
      await publish(ids.manager, ids.org, ids.first, 1);
      const after = await owner.query(
        `SELECT state.revision,state.published_version,p.en_text,p.ar_text
       FROM guest_location_privacy state
       JOIN guest_privacy_publications p
         ON p.organization_id=state.organization_id
        AND p.location_id=state.location_id
        AND p.version=state.published_version
       WHERE state.location_id=$1`,
        [ids.first],
      );
      expect(after.rows[0]).toMatchObject({
        revision: 2,
        published_version: 1,
        en_text: null,
        ar_text: "شركة تجريبية",
      });
      expect(
        (
          await owner.query(
            "SELECT count(*)::int AS n FROM guest_location_privacy WHERE location_id=$1",
            [ids.second],
          )
        ).rows[0]?.n,
      ).toBe(0);
    });

    it("retains immutable snapshots and unpublishes without deleting history", async () => {
      await expect(
        owner.query(
          "UPDATE guest_privacy_publications SET ar_text='changed' WHERE location_id=$1",
          [ids.first],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await runtime.query(
        "SELECT guest_information_unpublish_privacy($1,$2,$3,2)",
        [ids.manager, ids.org, ids.first],
      );
      const state = await owner.query(
        "SELECT revision,published_version FROM guest_location_privacy WHERE location_id=$1",
        [ids.first],
      );
      expect(state.rows[0]).toMatchObject({
        revision: 3,
        published_version: null,
      });
      expect(
        (
          await owner.query(
            "SELECT count(*)::int AS n FROM guest_privacy_publications WHERE location_id=$1",
            [ids.first],
          )
        ).rows[0]?.n,
      ).toBe(1);
    });

    it("enforces composite tenant FK, URL parsing and contact tri-state at SQL", async () => {
      await expect(
        owner.query(
          "INSERT INTO guest_location_privacy(organization_id,location_id) VALUES($1,$2)",
          [ids.org, ids.foreign],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      for (const bad of [
        "http://example.com",
        "https://safe.example@evil.test",
        "https://safe.example\\@evil.test",
        "https://user:pass@evil.test",
        "https://example.com:0/legal",
        "https://example.com:65536/legal",
        "https://example.com./legal",
        "https://[::1]/legal",
      ]) {
        await expect(
          owner.query(
            `UPDATE guest_location_privacy SET draft_ar_url=$1
         WHERE organization_id=$2 AND location_id=$3`,
            [bad, ids.org, ids.first],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      }
      await owner.query(
        `UPDATE guest_location_privacy SET draft_ar_url=$1
         WHERE organization_id=$2 AND location_id=$3`,
        ["https://example.com:8443/legal", ids.org, ids.first],
      );
      await expect(
        owner.query(
          `INSERT INTO guest_contact_location_overrides(
         organization_id,location_id,phone_mode,phone)
       VALUES($1,$2,'OVERRIDE',NULL)`,
          [ids.org, ids.second],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("applies Company default and explicit Location unavailability with CAS/audit", async () => {
      await runtime.query(
        `SELECT guest_information_set_company_contact(
         $1,$2,'Tenant Desk','+962790000001',NULL,NULL,false,0)`,
        [ids.admin, ids.org],
      );
      await runtime.query(
        `SELECT guest_information_set_location_contact(
         $1,$2,$3,'INHERIT',NULL,'UNAVAILABLE',NULL,
         'INHERIT',NULL,'INHERIT',NULL,false,0)`,
        [ids.manager, ids.org, ids.first],
      );
      const result = await owner.query(
        `SELECT d.phone AS default_phone,
              o.phone_mode::text AS mode,o.phone AS override_phone
       FROM guest_contact_company_defaults d
       JOIN guest_contact_location_overrides o USING(organization_id)
       WHERE o.location_id=$1`,
        [ids.first],
      );
      expect(result.rows[0]).toEqual({
        default_phone: "+962790000001",
        mode: "UNAVAILABLE",
        override_phone: null,
      });
      await expect(
        runtime.query(
          `SELECT guest_information_set_company_contact(
         $1,$2,'Tenant Desk','+962790000001',NULL,NULL,false,0)`,
          [ids.admin, ids.org],
        ),
      ).rejects.toMatchObject({ code: "40001" });
      const audit = await owner.query(
        `SELECT metadata_json->>'operation' AS operation
       FROM audit_events WHERE organization_id=$1
       AND event_type='MANAGEMENT_GUEST_INFORMATION_CHANGED'`,
        [ids.org],
      );
      expect(audit.rows.map((entry) => entry.operation).sort()).toEqual([
        "CONTACT_COMPANY_DEFAULTS_SAVED",
        "CONTACT_LOCATION_OVERRIDE_SAVED",
        "PRIVACY_DRAFT_SAVED",
        "PRIVACY_PUBLISHED",
        "PRIVACY_UNPUBLISHED",
      ]);
    });
  },
);
