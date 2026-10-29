import { describe, expect, it } from "vitest";
import { emergencyTakeoverView } from "./emergency-takeover-view";

const context = {
  canInitiate: true,
  task: {
    id: "11111111-1111-4111-8111-111111111111",
    taskType: "PARKING",
    status: "IN_PROGRESS",
    version: 2,
    assigneeMembershipId: "22222222-2222-4222-8222-222222222222",
    sessionId: "33333333-3333-4333-8333-333333333333",
    sessionState: "PARKING",
  },
  vehicle: { id: "44444444-4444-4444-8444-444444444444", licensePlate: "ABC-123", descriptor: null },
  currentAssignee: null,
  custody: {
    source: "NONE",
    latestKeyEventType: null,
    latestKeyEventActorMembershipId: null,
    occurredAt: null,
  },
  resources: { keySlot: null, parkingSpot: null, parkingZone: null },
  eligibleAssignees: [
    { membershipId: "55555555-5555-4555-8555-555555555555", identity: { firstName: "Ahmad", lastName: "Ali", email: "ahmad.one@example.com" } },
    { membershipId: "66666666-6666-4666-8666-666666666666", identity: { firstName: "Ahmad", lastName: "Ali", email: "ahmad.two@example.com" } },
    { membershipId: "77777777-7777-4777-8777-777777777777", identity: { firstName: null, lastName: null, email: "no-name@example.com" } },
  ],
  hasMoreEligibleAssignees: false,
  recentCustodyEvents: [],
  recentTakeovers: [],
} as unknown as Parameters<typeof emergencyTakeoverView>[0];

describe("Emergency Takeover replacement identity labels", () => {
  it.each(["en", "ar"] as const)(
    "keeps same-name employees distinguishable by email in %s",
    (locale) => {
      const candidates = emergencyTakeoverView(context, locale, "Asia/Amman").candidates;
      expect(candidates.map((item) => item.label)).toEqual([
        "Ahmad Ali · ahmad.one@example.com",
        "Ahmad Ali · ahmad.two@example.com",
        "no-name@example.com",
      ]);
      expect(new Set(candidates.map((item) => item.label)).size).toBe(3);
      expect(candidates.map((item) => item.membershipId)).toEqual([
        "55555555-5555-4555-8555-555555555555",
        "66666666-6666-4666-8666-666666666666",
        "77777777-7777-4777-8777-777777777777",
      ]);
    },
  );
});
