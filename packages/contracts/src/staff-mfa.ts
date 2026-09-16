import { z } from "zod";

const recoveryCodePattern = /^vmr1-[A-Za-z0-9_-]{11}-[A-Za-z0-9_-]{27}$/;
const totpCodePattern = /^\d{6}$/;
const base32SecretPattern = /^[A-Z2-7]{32}$/;

export const staffMfaFactorIdSchema = z.string().uuid();
export const staffMfaTotpCodeSchema = z.string().regex(totpCodePattern);
export const staffMfaRecoveryCodeSchema = z.string().regex(recoveryCodePattern);

export const staffMfaEnrollmentBeginRequestSchema = z.object({}).strict();

export const staffMfaProvisioningSchema = z
  .object({
    secretBase32: z.string().regex(base32SecretPattern),
    issuer: z.string().trim().min(1).max(128),
    algorithm: z.literal("SHA1"),
    digits: z.literal(6),
    periodSeconds: z.literal(30),
  })
  .strict();

export const staffMfaEnrollmentBeginResponseSchema = z
  .object({
    factorId: staffMfaFactorIdSchema,
    provisioning: staffMfaProvisioningSchema,
  })
  .strict();

export const staffMfaEnrollmentConfirmRequestSchema = z
  .object({
    factorId: staffMfaFactorIdSchema,
    code: staffMfaTotpCodeSchema,
  })
  .strict();

export const staffMfaEnrollmentConfirmResponseSchema = z
  .object({
    recoveryCodes: z.array(staffMfaRecoveryCodeSchema).length(10),
  })
  .strict();

export const staffMfaStepUpRequestSchema = z
  .object({
    code: staffMfaTotpCodeSchema,
  })
  .strict();

export const staffMfaStepUpResponseSchema = z
  .object({
    state: z.literal("ASSURED"),
  })
  .strict();

export const staffMfaSelfRecoveryBeginRequestSchema = z
  .object({
    recoveryCode: staffMfaRecoveryCodeSchema,
  })
  .strict();

export const staffMfaSelfRecoveryBeginResponseSchema =
  staffMfaEnrollmentBeginResponseSchema;

export const staffMfaRecoveryCodesReissueRequestSchema = z
  .object({
    code: staffMfaTotpCodeSchema,
  })
  .strict();

export const staffMfaRecoveryCodesReissueResponseSchema = z
  .object({
    factorId: staffMfaFactorIdSchema,
    recoveryCodes: z.array(staffMfaRecoveryCodeSchema).length(10),
  })
  .strict();

export const staffMfaStateValueSchema = z.enum([
  "ENROLLMENT_REQUIRED",
  "ENROLLMENT_PENDING",
  "STEP_UP_REQUIRED",
  "ASSURED",
]);

export const staffMfaStateResponseSchema = z
  .object({
    state: staffMfaStateValueSchema,
  })
  .strict();

export type StaffMfaEnrollmentBeginRequest = z.infer<
  typeof staffMfaEnrollmentBeginRequestSchema
>;
export type StaffMfaProvisioning = z.infer<typeof staffMfaProvisioningSchema>;
export type StaffMfaEnrollmentBeginResponse = z.infer<
  typeof staffMfaEnrollmentBeginResponseSchema
>;
export type StaffMfaEnrollmentConfirmRequest = z.infer<
  typeof staffMfaEnrollmentConfirmRequestSchema
>;
export type StaffMfaEnrollmentConfirmResponse = z.infer<
  typeof staffMfaEnrollmentConfirmResponseSchema
>;
export type StaffMfaStepUpRequest = z.infer<typeof staffMfaStepUpRequestSchema>;
export type StaffMfaStepUpResponse = z.infer<typeof staffMfaStepUpResponseSchema>;
export type StaffMfaSelfRecoveryBeginRequest = z.infer<
  typeof staffMfaSelfRecoveryBeginRequestSchema
>;
export type StaffMfaSelfRecoveryBeginResponse = z.infer<
  typeof staffMfaSelfRecoveryBeginResponseSchema
>;
export type StaffMfaRecoveryCodesReissueRequest = z.infer<
  typeof staffMfaRecoveryCodesReissueRequestSchema
>;
export type StaffMfaRecoveryCodesReissueResponse = z.infer<
  typeof staffMfaRecoveryCodesReissueResponseSchema
>;
export type StaffMfaStateValue = z.infer<typeof staffMfaStateValueSchema>;
export type StaffMfaStateResponse = z.infer<typeof staffMfaStateResponseSchema>;
