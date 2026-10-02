import { describe, expect, it } from "vitest";
import {
  sessionOverviewEntrySchema,
  retrievalQueueOverviewResponseSchema,
} from "./location-overview.js";
import {
  sessionOverviewFilterStates,
  sessionOverviewQuerySchema,
} from "./session-overview-query.js";
import { staffManagementDisplayName } from "./staff-management.js";

const id = "77777777-7777-4777-8777-777777777701";
const identity = {
  firstName: "Lina",
  lastName: "Haddad",
  email: "lina@example.com",
};
const session = {
  sessionId: id,
  state: "PARKED",
  createdAt: "2026-09-21T10:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
  currentAssigneeMembershipId: id,
  keySlotId: id,
  parkingSpotId: id,
  activeTask: { taskId: id, assignee: { membershipId: id, identity } },
  keySlot: { resourceId: id, code: "K-12", label: null },
  parkingSpot: { resourceId: id, code: "P-4", label: "North" },
  parkingZone: { resourceId: id, code: "Z-1", label: "Garage" },
  vehicle: {
    vehicleId: id,
    make: "Toyota",
    model: "Camry",
    color: "Black",
    plateCountry: "JO",
    plateNumberNormalized: "12-34567",
    temporaryDescriptor: null,
  },
};

describe("#241 bounded overview contract", () => {
  it("defines all six server filters and preserves bounded strict queries", () => {
    expect(sessionOverviewQuerySchema.parse({})).toEqual({
      limit: 50,
      filter: "ALL",
    });
    expect(sessionOverviewFilterStates).toEqual({
      ALL: [
        "CHECKING_IN",
        "AWAITING_PARKING",
        "PARKING",
        "PARKED",
        "REQUESTED",
        "RETRIEVING",
        "READY",
        "HANDOFF_PENDING",
      ],
      CHECK_IN: ["CHECKING_IN", "AWAITING_PARKING"],
      PARKED: ["PARKED"],
      REQUESTED: ["REQUESTED"],
      IN_TRANSIT: ["PARKING", "RETRIEVING"],
      READY_HANDOFF: ["READY", "HANDOFF_PENDING"],
    });
    for (const query of [
      { filter: "COMPLETED" },
      { limit: 101 },
      { organizationId: id },
      { filter: ["ALL"] },
    ]) {
      expect(sessionOverviewQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it("projects existing facts with canonical #240 staff identity", () => {
    const parsed = sessionOverviewEntrySchema.parse(session);
    expect(parsed).toEqual(session);
    expect(
      staffManagementDisplayName(parsed.activeTask!.assignee!.identity),
    ).toBe("Lina Haddad");
    expect(staffManagementDisplayName({ ...identity, lastName: null })).toBe(
      identity.email,
    );
    expect(
      sessionOverviewEntrySchema.safeParse({
        ...session,
        activeTask: {
          taskId: id,
          assignee: {
            membershipId: id,
            identity: { ...identity, displayName: "Invented" },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      sessionOverviewEntrySchema.parse({
        ...session,
        activeTask: null,
        keySlot: null,
        parkingSpot: null,
        parkingZone: null,
      }).activeTask,
    ).toBeNull();
  });

  it("shares task-owned identity with the Retrieval Queue", () => {
    const queue = retrievalQueueOverviewResponseSchema.parse({
      items: [
        {
          requestId: id,
          valetSessionId: id,
          requestedAt: session.createdAt,
          status: "OPEN",
          requesterType: "CUSTOMER",
          task: {
            taskId: id,
            status: "ASSIGNED",
            currentAssigneeMembershipId: id,
            assignee: session.activeTask.assignee,
          },
        },
      ],
      nextCursor: null,
    });
    expect(queue.items[0]!.task!.assignee).toEqual(session.activeTask.assignee);
  });
});
