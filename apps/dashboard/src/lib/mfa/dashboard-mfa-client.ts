import {
  staffMfaEnrollmentBeginRequestSchema,
  staffMfaEnrollmentBeginResponseSchema,
  staffMfaEnrollmentConfirmRequestSchema,
  staffMfaEnrollmentConfirmResponseSchema,
  staffMfaRecoveryCodesReissueRequestSchema,
  staffMfaRecoveryCodesReissueResponseSchema,
  staffMfaSelfRecoveryBeginRequestSchema,
  staffMfaSelfRecoveryBeginResponseSchema,
  staffMfaStateResponseSchema,
  staffMfaStepUpRequestSchema,
  staffMfaStepUpResponseSchema,
  type StaffMfaEnrollmentBeginResponse,
  type StaffMfaEnrollmentConfirmRequest,
  type StaffMfaEnrollmentConfirmResponse,
  type StaffMfaRecoveryCodesReissueRequest,
  type StaffMfaRecoveryCodesReissueResponse,
  type StaffMfaSelfRecoveryBeginRequest,
  type StaffMfaSelfRecoveryBeginResponse,
  type StaffMfaStateResponse,
  type StaffMfaStepUpRequest,
  type StaffMfaStepUpResponse,
} from "@valet/contracts";

import type { DashboardApiClient } from "../api/dashboard-api-client";

const MFA_BASE = "/v1/staff/auth/mfa";

/**
 * MFA material is deliberately returned to the caller and never cached by this
 * client. Provisioning secrets and recovery codes therefore remain ephemeral.
 */
export class DashboardMfaClient {
  constructor(private readonly api: DashboardApiClient) {}

  state(signal?: AbortSignal): Promise<StaffMfaStateResponse> {
    return this.api.request(`${MFA_BASE}/state`, staffMfaStateResponseSchema, {
      method: "GET",
      signal,
    });
  }

  beginEnrollment(signal?: AbortSignal): Promise<StaffMfaEnrollmentBeginResponse> {
    const body = staffMfaEnrollmentBeginRequestSchema.parse({});
    return this.api.request(
      `${MFA_BASE}/enrollment/begin`,
      staffMfaEnrollmentBeginResponseSchema,
      { method: "POST", body, signal },
    );
  }

  confirmEnrollment(
    input: StaffMfaEnrollmentConfirmRequest,
    signal?: AbortSignal,
  ): Promise<StaffMfaEnrollmentConfirmResponse> {
    const body = staffMfaEnrollmentConfirmRequestSchema.parse(input);
    return this.api.request(
      `${MFA_BASE}/enrollment/confirm`,
      staffMfaEnrollmentConfirmResponseSchema,
      { method: "POST", body, signal },
    );
  }

  stepUp(
    input: StaffMfaStepUpRequest,
    signal?: AbortSignal,
  ): Promise<StaffMfaStepUpResponse> {
    const body = staffMfaStepUpRequestSchema.parse(input);
    return this.api.request(`${MFA_BASE}/step-up`, staffMfaStepUpResponseSchema, {
      method: "POST",
      body,
      signal,
    });
  }

  beginRecovery(
    input: StaffMfaSelfRecoveryBeginRequest,
    signal?: AbortSignal,
  ): Promise<StaffMfaSelfRecoveryBeginResponse> {
    const body = staffMfaSelfRecoveryBeginRequestSchema.parse(input);
    return this.api.request(
      `${MFA_BASE}/recovery/begin`,
      staffMfaSelfRecoveryBeginResponseSchema,
      { method: "POST", body, signal },
    );
  }

  reissueRecoveryCodes(
    input: StaffMfaRecoveryCodesReissueRequest,
    signal?: AbortSignal,
  ): Promise<StaffMfaRecoveryCodesReissueResponse> {
    const body = staffMfaRecoveryCodesReissueRequestSchema.parse(input);
    return this.api.request(
      `${MFA_BASE}/recovery-codes/reissue`,
      staffMfaRecoveryCodesReissueResponseSchema,
      { method: "POST", body, signal },
    );
  }
}
