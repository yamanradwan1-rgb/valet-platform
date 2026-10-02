import { z } from "zod";
import { overviewListQuerySchema } from "./location-overview-pagination.js";
import type { DashboardSessionState } from "./location-overview.js";

export const sessionOverviewFilterSchema = z.enum([
  "ALL",
  "CHECK_IN",
  "PARKED",
  "REQUESTED",
  "IN_TRANSIT",
  "READY_HANDOFF",
]);
export type SessionOverviewFilter = z.infer<typeof sessionOverviewFilterSchema>;
export const sessionOverviewCursorSchema = z
  .object({
    v: z.literal(2),
    d: z.literal("sessions"),
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    filter: sessionOverviewFilterSchema,
    sortKey: z.string().datetime({ offset: true }),
    tiebreakerId: z.string().uuid(),
  })
  .strict();
export const sessionOverviewQuerySchema = overviewListQuerySchema.extend({
  filter: sessionOverviewFilterSchema.default("ALL"),
});

export const sessionOverviewFilterStates: Readonly<
  Record<SessionOverviewFilter, readonly DashboardSessionState[]>
> = {
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
};
