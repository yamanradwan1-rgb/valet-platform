import { z } from "zod";
import { shiftPresenceFieldSchema } from "./shift-presence-management.js";

export const managementPresenceAuditEvents = [
  "SHIFT_PRESENCE_COMPANY_POLICY_CHANGED",
  "SHIFT_PRESENCE_LOCATION_POLICY_CHANGED",
  "SHIFT_PRESENCE_ZONE_CREATED",
  "SHIFT_PRESENCE_ZONE_UPDATED",
  "SHIFT_PRESENCE_EXCEPTION_APPROVED",
  "SHIFT_PRESENCE_EXCEPTION_REJECTED",
  "SHIFT_PRESENCE_APPROVAL_EXPIRED",
] as const;

export const managementPresenceAuditDetailSchema = z
  .object({
    kind: z.literal("PRESENCE"),
    revision: z.number().int().positive().optional(),
    field: shiftPresenceFieldSchema.optional(),
    operation: z.enum(["SET", "CLEAR"]).optional(),
    state: z.enum(["ACTIVE", "DISABLED", "APPROVED", "REJECTED"]).optional(),
    reason: z.literal("APPROVER_AUTHORITY_REVOKED").optional(),
  })
  .strict();
