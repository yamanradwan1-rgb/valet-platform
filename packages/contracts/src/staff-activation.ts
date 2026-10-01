import { z } from "zod";
import { staffLoginRequestSchema } from "./staff-auth.js";

export const staffInvitationTokenSchema = z
  .string()
  .regex(/^vsi1\.[A-Za-z0-9_-]{43}$/);

// DEC-029 creation policy; existing password proof keeps DEC-023 transport bounds.
export const staffPasswordCreationSchema =
  staffLoginRequestSchema.shape.password
    .refine((value) => !/[\r\n]/.test(value))
    .refine(
      (value) =>
        Array.from(value).length >= 15 && Array.from(value).length <= 128,
    );

export const staffActivationRequestSchema = z
  .object({
    inviteToken: staffInvitationTokenSchema,
    password: staffLoginRequestSchema.shape.password,
  })
  .strict();

export const staffActivationResponseSchema = z
  .object({
    outcome: z.enum(["ACTIVATED", "ALREADY_ACTIVATED"]),
  })
  .strict();

export const staffActivationAuditMetadataSchema = z
  .object({
    invitationId: z.string().uuid(),
    generation: z.number().int().positive(),
    outcome: z.literal("ACTIVATED"),
  })
  .strict();

export const staffPendingInvitationSchema = z
  .object({
    generation: z.number().int().positive(),
    expiresAt: z.string().datetime({ offset: true }),
    state: z.enum(["CURRENT", "EXPIRED", "REVOKED"]),
  })
  .strict();

export type StaffActivationRequest = z.infer<
  typeof staffActivationRequestSchema
>;
export type StaffActivationResponse = z.infer<
  typeof staffActivationResponseSchema
>;
