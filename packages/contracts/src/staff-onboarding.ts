import { z } from "zod";

import { staffLoginRequestSchema } from "./staff-auth.js";
import { staffManagementIdentitySchema } from "./staff-management.js";

export const staffOnboardingRoleSchema = z.enum([
  "LOCATION_MANAGER",
  "VALET_SUPERVISOR",
  "VALET_EMPLOYEE",
]);

export const staffOnboardingAuditEventSchema = z.enum([
  "STAFF_ONBOARDING_INVITATION_ISSUED",
  "STAFF_ONBOARDING_INVITATION_RESENT",
]);

export const staffOnboardingAuditMetadataSchema = z
  .object({
    invitationId: z.string().uuid(),
    generation: z.number().int().positive(),
    operationId: z.string().uuid(),
    outcome: z.literal("INVITE_ISSUED"),
    role: staffOnboardingRoleSchema,
    locationCount: z.number().int().min(1),
  })
  .strict();

export const staffOnboardingCreateSchema = z
  .object({
    operationId: z.string().uuid(),
    firstName: staffManagementIdentitySchema.shape.firstName.unwrap(),
    lastName: staffManagementIdentitySchema.shape.lastName.unwrap(),
    email: staffLoginRequestSchema.shape.email,
    role: staffOnboardingRoleSchema,
    locationIds: z
      .array(
        z
          .string()
          .uuid()
          .transform((value) => value.toLowerCase()),
      )
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();

export const staffOnboardingResendSchema = z
  .object({ operationId: z.string().uuid() })
  .strict();

const invitationFacts = {
  membershipId: z.string().uuid(),
  invitationId: z.string().uuid(),
  generation: z.number().int().positive(),
  expiresAt: z.string().datetime({ offset: true }),
};

export const staffOnboardingResultSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      ...invitationFacts,
      outcome: z.literal("INVITE_ISSUED"),
      activationLink: z.string().url(),
    })
    .strict(),
  z
    .object({
      ...invitationFacts,
      outcome: z.literal("INVITE_PENDING_LINK_UNAVAILABLE"),
    })
    .strict(),
]);

export type StaffOnboardingCreate = z.infer<typeof staffOnboardingCreateSchema>;
export type StaffOnboardingResend = z.infer<typeof staffOnboardingResendSchema>;
export type StaffOnboardingResult = z.infer<typeof staffOnboardingResultSchema>;
