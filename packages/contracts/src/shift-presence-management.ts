import { z } from "zod";

import {
  shiftPresenceCompanyPolicySchema,
  shiftPresenceLocationPolicySchema,
  shiftPresenceEffectivePolicySchema,
  shiftPresenceModeSchema,
  shiftPresenceAccuracyThresholdSchema,
  shiftPresenceAgeThresholdSchema,
  shiftPresenceRevisionSchema,
} from "./shift-presence-policy.js";
import { shiftPresenceZoneSchema } from "./shift-presence.js";
import { shiftPresenceExceptionResponseSchema } from "./shift-presence-public.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
const mutation = {
  mutationId: uuid,
  expectedRevision: shiftPresenceRevisionSchema,
};
const fields = {
  shiftStartPresenceMode: shiftPresenceModeSchema,
  shiftEndPresenceMode: shiftPresenceModeSchema,
  shiftPresenceMaxAccuracyMeters: shiftPresenceAccuracyThresholdSchema,
  shiftPresenceMaxFixAgeSeconds: shiftPresenceAgeThresholdSchema,
};

export const shiftPresenceFieldSchema = z.enum([
  "shiftStartPresenceMode",
  "shiftEndPresenceMode",
  "shiftPresenceMaxAccuracyMeters",
  "shiftPresenceMaxFixAgeSeconds",
]);

export const shiftPresenceCompanySetRequestSchema = z.discriminatedUnion(
  "field",
  [
    z
      .object({
        ...mutation,
        field: z.literal("shiftStartPresenceMode"),
        value: fields.shiftStartPresenceMode,
      })
      .strict(),
    z
      .object({
        ...mutation,
        field: z.literal("shiftEndPresenceMode"),
        value: fields.shiftEndPresenceMode,
      })
      .strict(),
    z
      .object({
        ...mutation,
        field: z.literal("shiftPresenceMaxAccuracyMeters"),
        value: fields.shiftPresenceMaxAccuracyMeters,
      })
      .strict(),
    z
      .object({
        ...mutation,
        field: z.literal("shiftPresenceMaxFixAgeSeconds"),
        value: fields.shiftPresenceMaxFixAgeSeconds,
      })
      .strict(),
  ],
);
const inherited = {
  expectedCompanyRevision: shiftPresenceRevisionSchema,
  configurationFingerprint: fingerprint,
};
export const shiftPresenceLocationSetRequestSchema = z.discriminatedUnion(
  "field",
  [
    z
      .object({
        ...mutation,
        ...inherited,
        field: z.literal("shiftStartPresenceMode"),
        value: fields.shiftStartPresenceMode,
      })
      .strict(),
    z
      .object({
        ...mutation,
        ...inherited,
        field: z.literal("shiftEndPresenceMode"),
        value: fields.shiftEndPresenceMode,
      })
      .strict(),
    z
      .object({
        ...mutation,
        ...inherited,
        field: z.literal("shiftPresenceMaxAccuracyMeters"),
        value: fields.shiftPresenceMaxAccuracyMeters,
      })
      .strict(),
    z
      .object({
        ...mutation,
        ...inherited,
        field: z.literal("shiftPresenceMaxFixAgeSeconds"),
        value: fields.shiftPresenceMaxFixAgeSeconds,
      })
      .strict(),
  ],
);
export const shiftPresenceLocationClearRequestSchema = z
  .object({
    ...mutation,
    ...inherited,
    field: shiftPresenceFieldSchema,
  })
  .strict();

export const shiftPresenceReadinessSchema = z
  .object({
    applicability: z.enum(["NOT_APPLICABLE", "WARNING", "STRICT"]),
    configurationUsable: z.boolean(),
    strictActivationAllowed: z.literal(false),
    activeZoneCount: z.number().int().nonnegative(),
    blockers: z.array(
      z.enum([
        "NO_USABLE_ATTENDANCE_ZONE",
        "INVALID_PRESENCE_CONFIGURATION",
        "STRICT_ROLLOUT_CLOSED",
      ]),
    ),
    companyRevision: shiftPresenceRevisionSchema,
    locationRevision: shiftPresenceRevisionSchema,
    configurationFingerprint: fingerprint,
    observedAt: timestamp,
  })
  .strict();

export const shiftPresenceCompanyResponseSchema = z
  .object({
    organizationId: uuid,
    policy: shiftPresenceCompanyPolicySchema,
    capabilities: z
      .object({
        canEdit: z.boolean(),
        strictActivationAllowed: z.literal(false),
      })
      .strict(),
  })
  .strict();
export const shiftPresenceLocationResponseSchema = z
  .object({
    organizationId: uuid,
    locationId: uuid,
    timezone: z.string().min(1),
    company: shiftPresenceCompanyPolicySchema,
    overrides: shiftPresenceLocationPolicySchema,
    effective: shiftPresenceEffectivePolicySchema,
    readiness: shiftPresenceReadinessSchema,
    capabilities: z
      .object({ canEdit: z.boolean(), canReviewExceptions: z.boolean() })
      .strict(),
  })
  .strict();

const zoneDraft = shiftPresenceZoneSchema.omit({
  id: true,
  organizationId: true,
  locationId: true,
  revision: true,
});
export const shiftPresenceZoneCreateRequestSchema = zoneDraft
  .extend({
    mutationId: uuid,
    zoneId: uuid,
  })
  .strict();
export const shiftPresenceZoneUpdateRequestSchema = zoneDraft
  .extend(mutation)
  .strict();
export const shiftPresenceZoneResponseSchema = z
  .object({
    zone: shiftPresenceZoneSchema,
    readiness: shiftPresenceReadinessSchema,
  })
  .strict();
export const shiftPresenceListQuerySchema = z
  .object({
    cursor: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export const shiftPresenceZoneListResponseSchema = z
  .object({
    items: z.array(shiftPresenceZoneSchema).max(100),
    nextCursor: uuid.nullable(),
  })
  .strict();
export const shiftPresenceExceptionReviewRequestSchema = z
  .object(mutation)
  .strict();
export const shiftPresenceExceptionListQuerySchema =
  shiftPresenceListQuerySchema
    .extend({
      view: z.enum(["PENDING", "HISTORY"]).default("PENDING"),
    })
    .strict();
export const shiftPresenceManagementExceptionSchema =
  shiftPresenceExceptionResponseSchema
    .extend({
      requester: z
        .object({
          userId: uuid,
          membershipId: uuid,
          firstName: z.string().nullable(),
          lastName: z.string().nullable(),
          email: z.string(),
        })
        .strict(),
      timezone: z.string(),
      canReview: z.boolean(),
    })
    .strict();
export const shiftPresenceExceptionListResponseSchema = z
  .object({
    items: z.array(shiftPresenceManagementExceptionSchema).max(100),
    nextCursor: uuid.nullable(),
  })
  .strict();
export const shiftPresenceManagementResultSchema = z
  .object({
    mutationId: uuid,
    attribution: z.enum(["COMMITTED", "UNKNOWN"]),
    entityId: uuid.nullable(),
    revision: shiftPresenceRevisionSchema.nullable(),
    canonical: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("POLICY"),
          value: z.union([
            shiftPresenceCompanyResponseSchema,
            shiftPresenceLocationResponseSchema,
          ]),
        })
        .strict(),
      z
        .object({
          kind: z.literal("ZONE"),
          value: shiftPresenceZoneResponseSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal("EXCEPTION"),
          value: shiftPresenceManagementExceptionSchema,
        })
        .strict(),
    ]),
  })
  .strict();
export const shiftPresenceManagementResultQuerySchema = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("POLICY") }).strict(),
    z.object({ kind: z.literal("ZONE"), entityId: uuid }).strict(),
    z.object({ kind: z.literal("EXCEPTION"), entityId: uuid }).strict(),
  ],
);
export type ShiftPresenceManagementResultQuery = z.infer<
  typeof shiftPresenceManagementResultQuerySchema
>;

export type ShiftPresenceCompanySetRequest = z.infer<
  typeof shiftPresenceCompanySetRequestSchema
>;
export type ShiftPresenceLocationSetRequest = z.infer<
  typeof shiftPresenceLocationSetRequestSchema
>;
export type ShiftPresenceLocationClearRequest = z.infer<
  typeof shiftPresenceLocationClearRequestSchema
>;
export type ShiftPresenceZoneCreateRequest = z.infer<
  typeof shiftPresenceZoneCreateRequestSchema
>;
export type ShiftPresenceZoneUpdateRequest = z.infer<
  typeof shiftPresenceZoneUpdateRequestSchema
>;
export type ShiftPresenceField = z.infer<typeof shiftPresenceFieldSchema>;
