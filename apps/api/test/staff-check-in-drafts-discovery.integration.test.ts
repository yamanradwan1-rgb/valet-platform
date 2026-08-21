import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createStaffCheckInDraftsHarness,
  type StaffCheckInDraftsHarness,
} from "./staff-check-in-drafts-harness";

describe("Staff Check-In Draft Discovery Cardinality & Privacy", () => {
  let harness: StaffCheckInDraftsHarness;

  beforeAll(async () => {
    harness = createStaffCheckInDraftsHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  describe("Discovery Cardinality & State Filtering", () => {
    it("returns empty array when 0 drafts exist", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const res = await harness.request<{ drafts: unknown[] }>(
        "GET",
        `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`,
        { token },
      );
      expect(res.status).toBe(200);
      expect(res.body.drafts).toEqual([]);
    });

    it("returns all drafts ordered by createdAt ASC, sessionId ASC when multiple exist", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const d1 = await harness.createDraft(fixture, {
        createdAt: new Date("2026-08-21T10:00:00.000Z"),
      });
      const d2 = await harness.createDraft(fixture, {
        createdAt: new Date("2026-08-21T11:00:00.000Z"),
      });
      const d3 = await harness.createDraft(fixture, {
        createdAt: new Date("2026-08-21T09:00:00.000Z"),
      });

      const res = await harness.request<{
        drafts: Array<{ sessionId: string }>;
      }>("GET", `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`, {
        token,
      });

      expect(res.status).toBe(200);
      expect(res.body.drafts).toHaveLength(3);
      expect(res.body.drafts.map((d) => d.sessionId)).toEqual([
        d3.sessionId,
        d1.sessionId,
        d2.sessionId,
      ]);
    });

    it("excludes sessions that moved past CHECKING_IN", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      await harness.createDraft(fixture, { state: "AWAITING_PARKING" });
      await harness.createDraft(fixture, { state: "PARKING" });
      await harness.createDraft(fixture, { state: "PARKED" });
      await harness.createDraft(fixture, { state: "COMPLETED" });

      const { sessionId: draftId } = await harness.createDraft(fixture, {
        state: "CHECKING_IN",
      });

      const res = await harness.request<{
        drafts: Array<{ sessionId: string }>;
      }>("GET", `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`, {
        token,
      });

      expect(res.status).toBe(200);
      expect(res.body.drafts).toHaveLength(1);
      expect(res.body.drafts[0]?.sessionId).toBe(draftId);
    });
  });

  describe("Privacy & Tenant Isolation", () => {
    it("does not expose customer data, tokens, or post-intake assignments", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      await harness.createDraft(fixture);

      const res = await harness.request<{
        drafts: Array<Record<string, unknown>>;
      }>("GET", `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`, {
        token,
      });

      expect(res.status).toBe(200);
      const draft = res.body.drafts[0]!;
      expect(draft.customerId).toBeUndefined();
      expect(draft.customerPhone).toBeUndefined();
      expect(draft.customerAccessTokenHash).toBeUndefined();
      expect(draft.keySlot).toBeUndefined();
      expect(draft.parking).toBeUndefined();
    });

    it("prevents drafts from another organization from leaking", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const foreign = await harness.context.createFixture();
      await harness.createDraft(foreign);

      const res = await harness.request<{ drafts: unknown[] }>(
        "GET",
        `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`,
        { token },
      );

      expect(res.status).toBe(200);
      expect(res.body.drafts).toEqual([]);
    });
  });
});
