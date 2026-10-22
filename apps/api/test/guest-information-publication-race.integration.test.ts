import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readGuestInformationProjection } from "../src/modules/management/guest-information-public-projection";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
let pool: Pool;

beforeAll(async () => {
  await fixture.start();
  pool = new Pool({ connectionString: fixture.runtimeDatabaseUrl(), max: 4 });
}, 120_000);
afterAll(async () => {
  if (pool) await pool.end();
  await fixture.stop();
}, 60_000);

async function publishedLocation() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  const base = `/v1/staff/management/organizations/${membership.organizationId}` +
    `/locations/${location.locationId}/guest-information`;
  const saved = await fixture.managementPut(`${base}/privacy`, auth.accessToken, {
    expectedRevision: 0,
    drafts: { en: { text: "Already published", url: "" }, ar: { text: "", url: "" } },
  });
  expect(saved.status).toBe(200);
  expect((await fixture.managementPost(`${base}/privacy/publish`, auth.accessToken,
    { expectedRevision: 1 })).status).toBe(201);
  return { base, auth, membership, location };
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("#316 Guest information publication race", () => {
  it("reader-first pins active publication until after the response transaction", async () => {
    const setup = await publishedLocation();
    const reader = await pool.connect();
    let opened = false;
    try {
      await reader.query("BEGIN");
      opened = true;
      const content = await readGuestInformationProjection(reader, {
        organizationId: setup.membership.organizationId,
        locationId: setup.location.locationId, locale: "en",
      });
      expect(content.privacy.status).toBe("PUBLISHED");
      let completed = false;
      const pending = fixture.managementPost(`${setup.base}/privacy/unpublish`,
        setup.auth.accessToken, { expectedRevision: 2 })
        .then((result) => { completed = true; return result; });
      await delay(80);
      expect(completed).toBe(false);
      await reader.query("COMMIT");
      opened = false;
      expect((await pending).status).toBe(201);
    } finally {
      if (opened) await reader.query("ROLLBACK");
      reader.release();
    }
    const after = await fixture.managementGet(`${setup.base}/preview?locale=en`,
      setup.auth.accessToken);
    expect(after.body?.privacy).toMatchObject({ status: "UNAVAILABLE" });
  }, 30_000);

  it("unpublisher-first makes a blocked new reader observe the committed unavailable state", async () => {
    const setup = await publishedLocation();
    const writer = await pool.connect();
    const reader = await pool.connect();
    let writeOpen = false;
    let readOpen = false;
    try {
      await writer.query("BEGIN");
      writeOpen = true;
      await writer.query(
        `SELECT guest_information_unpublish_privacy($1::uuid,$2::uuid,$3::uuid,$4::integer)`,
        [setup.membership.membershipId, setup.membership.organizationId,
          setup.location.locationId, 2]);
      await reader.query("BEGIN");
      readOpen = true;
      let readComplete = false;
      const read = readGuestInformationProjection(reader, {
        organizationId: setup.membership.organizationId,
        locationId: setup.location.locationId, locale: "en",
      }).then((result) => { readComplete = true; return result; });
      await delay(80);
      expect(readComplete).toBe(false);
      await writer.query("COMMIT");
      writeOpen = false;
      const result = await read;
      expect(result.privacy).toMatchObject({ status: "UNAVAILABLE", text: null, version: null });
      await reader.query("COMMIT");
      readOpen = false;
    } finally {
      if (writeOpen) await writer.query("ROLLBACK");
      if (readOpen) await reader.query("ROLLBACK");
      writer.release();
      reader.release();
    }
  }, 30_000);
});
