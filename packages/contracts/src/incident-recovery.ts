import { z } from "zod";

import { reportIncidentResponseSchema } from "./incidents.js";

export const incidentRecoveryProtocol = "actor-bound-intent-v1" as const;
export const incidentRecoveryCapability =
  "incident-recovery-intent-v1" as const;
export const incidentRecoveryProtocolHeader =
  "Valet-Incident-Submission-Protocol" as const;

export const incidentRecoveryIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Expected an RFC 9562 UUIDv8 recovery identity.",
  );

export const legacyIncidentIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Expected an RFC 9562 UUIDv4 legacy identity.",
  );

export function isIncidentRecoveryId(value: string): boolean {
  return incidentRecoveryIdSchema.safeParse(value).success;
}

export const incidentRecoveryParamsSchema = z
  .object({
    incidentId: incidentRecoveryIdSchema,
    sessionId: z.string().uuid(),
  })
  .strict();

export const incidentRecoveryEmptyBodySchema = z.object({}).strict();

export const incidentRecoveryMarkerSchema = z
  .object({
    createdAt: z.string().datetime({ offset: false }),
    incidentId: incidentRecoveryIdSchema,
    installationGeneration: z.string().min(1).max(128),
    locationId: z.string().uuid(),
    membershipId: z.string().uuid(),
    organizationId: z.string().uuid(),
    protocol: z.literal(incidentRecoveryProtocol),
    sessionId: z.string().uuid(),
    version: z.literal(1),
  })
  .strict();

const recoveryIdentitySchema = z
  .object({
    incidentId: incidentRecoveryIdSchema,
    sessionId: z.string().uuid(),
  })
  .strict();

export const reserveIncidentRecoveryResponseSchema = recoveryIdentitySchema
  .extend({
    expiresAt: z.string().datetime({ offset: false }),
    outcome: z.literal("RESERVED"),
  })
  .strict();

export const incidentRecoveryResponseSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("FOUND"),
      report: reportIncidentResponseSchema,
    })
    .strict(),
  reserveIncidentRecoveryResponseSchema,
  recoveryIdentitySchema.extend({ outcome: z.literal("RETIRED") }).strict(),
  recoveryIdentitySchema.extend({ outcome: z.literal("UNKNOWN") }).strict(),
]);

export type IncidentRecoveryResponse = z.infer<
  typeof incidentRecoveryResponseSchema
>;
export type IncidentRecoveryMarker = z.infer<
  typeof incidentRecoveryMarkerSchema
>;
export type ReserveIncidentRecoveryResponse = z.infer<
  typeof reserveIncidentRecoveryResponseSchema
>;
