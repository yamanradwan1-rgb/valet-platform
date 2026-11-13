import { z } from "zod";

import { apiErrorSchema } from "./api-errors.js";
import { staffPasswordCreationSchema } from "./staff-activation.js";

export const STAFF_PASSWORD_RESET_PAGE_PATH = "/staff/reset-password";
export const STAFF_PASSWORD_RESET_FRAGMENT_KEY = "reset";

// The last sextet of 32 unpadded base64url bytes has two zero pad bits.
export const staffPasswordResetTokenSchema = z
  .string()
  .length(49)
  .regex(/^vspr1\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);

const fragmentPrefix = `#${STAFF_PASSWORD_RESET_FRAGMENT_KEY}=`;

const staffPasswordResetLinkSchema = z.string().refine((value) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    value === `${url.origin}${STAFF_PASSWORD_RESET_PAGE_PATH}${url.hash}` &&
    url.hash.startsWith(fragmentPrefix) &&
    staffPasswordResetTokenSchema.safeParse(
      url.hash.slice(fragmentPrefix.length),
    ).success
  );
});

export const staffPasswordResetStatusResponseSchema = z
  .object({
    eligible: z.boolean(),
    latestGeneration: z.number().int().nonnegative(),
    linkState: z.enum(["NONE", "ACTIVE", "EXPIRED", "CONSUMED", "REVOKED"]),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export const staffPasswordResetIssueRequestSchema = z
  .object({
    operationId: z.string().uuid(),
    expectedGeneration: z.number().int().nonnegative(),
  })
  .strict();

const issuanceFacts = {
  membershipId: z.string().uuid(),
  generation: z.number().int().positive(),
  expiresAt: z.string().datetime({ offset: true }),
};

export const staffPasswordResetIssueResponseSchema = z.discriminatedUnion(
  "outcome",
  [
    z
      .object({
        ...issuanceFacts,
        outcome: z.literal("LINK_ISSUED"),
        resetLink: staffPasswordResetLinkSchema,
      })
      .strict(),
    z
      .object({
        ...issuanceFacts,
        outcome: z.literal("LINK_UNAVAILABLE"),
      })
      .strict(),
  ],
);

export const staffPasswordResetRedeemRequestSchema = z
  .object({
    resetToken: staffPasswordResetTokenSchema,
    newPassword: staffPasswordCreationSchema,
  })
  .strict();

export const staffPasswordResetRedeemResponseSchema = z
  .object({ outcome: z.literal("PASSWORD_RESET_COMPLETE") })
  .strict();

export const staffPasswordResetErrorSchema = apiErrorSchema.extend({
  code: z.enum([
    "AUTHORIZATION_DENIED",
    "MFA_STEP_UP_REQUIRED",
    "REQUEST_INVALID",
    "STAFF_PASSWORD_RESET_CONFLICT",
    "STAFF_PASSWORD_RESET_INVALID",
    "STAFF_PASSWORD_RESET_RATE_LIMITED",
    "STAFF_PASSWORD_RESET_UNAVAILABLE",
  ]),
});

export type StaffPasswordResetStatusResponse = z.infer<
  typeof staffPasswordResetStatusResponseSchema
>;
export type StaffPasswordResetIssueRequest = z.infer<
  typeof staffPasswordResetIssueRequestSchema
>;
export type StaffPasswordResetIssueResponse = z.infer<
  typeof staffPasswordResetIssueResponseSchema
>;
export type StaffPasswordResetRedeemRequest = z.infer<
  typeof staffPasswordResetRedeemRequestSchema
>;
export type StaffPasswordResetRedeemResponse = z.infer<
  typeof staffPasswordResetRedeemResponseSchema
>;
export type StaffPasswordResetError = z.infer<
  typeof staffPasswordResetErrorSchema
>;
