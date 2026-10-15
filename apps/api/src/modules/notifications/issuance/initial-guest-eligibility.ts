import type { PostgresTransaction } from "../../../common/database/postgres";
import type {
  EligibleInitialGuestRecipient,
  InitialGuestScope,
} from "../../valet-sessions/initial-guest-issuance";
import { isCanonicalOutboundRecipient } from "./initial-guest-crypto";

interface PolicyRow {
  id: string;
  location_id: string | null;
  enabled: boolean | null;
  language: "ar" | "en" | null;
  provider_binding_id: string | null;
  template_catalog_version: string | null;
  revision: number;
}

interface BindingRow {
  id: string;
  enabled: boolean;
  revision: number;
  environment: string;
  provider_verified_at: Date | null;
}

interface PermissionRow {
  id: string;
  revision: number;
  evidence_reference: string;
  collected_at: Date;
  expires_at: Date | null;
  withdrawn_at: Date | null;
}

export function createInitialGuestEligibilityResolver(
  recipientDigest: (phone: string) => string,
  environment: "test" | "production",
) {
  return async (
    transaction: PostgresTransaction,
    scope: InitialGuestScope,
  ): Promise<EligibleInitialGuestRecipient | null> => {
    // Only the just-created, exact-scoped Session/Customer is recipient authority.
    // DEC-025 forbids runtime Customer UPDATE; the W1 SECURITY DEFINER function
    // acquires its narrow Customer row lock without granting table-level UPDATE.
    const customer = await transaction.query<{ phone_normalized: string }>(
      `SELECT phone_normalized FROM outbound_read_intake_customer($1, $2, $3)`,
      [scope.organizationId, scope.sessionId, scope.customerId],
    );
    const phone = customer.rows[0]?.phone_normalized;
    if (!isCanonicalOutboundRecipient(phone)) {
      return null;
    }
    const digest = recipientDigest(phone);

    const policies = await transaction.query<PolicyRow>(
      `SELECT id::text, location_id::text, enabled, language,
              provider_binding_id::text, template_catalog_version, revision
       FROM outbound_messaging_policies
       WHERE organization_id = $1 AND purpose = 'INITIAL_GUEST_ACCESS'
         AND (location_id IS NULL OR location_id = $2)
       ORDER BY location_id NULLS LAST FOR SHARE`,
      [scope.organizationId, scope.locationId],
    );
    const company = policies.rows.find((row) => row.location_id === null);
    if (company === undefined) return null;
    const location = policies.rows.find((row) => row.location_id === scope.locationId);
    const enabled = location?.enabled ?? company.enabled;
    const language = location?.language ?? company.language;
    const bindingId = location?.provider_binding_id ?? company.provider_binding_id;
    const templateVersion = location?.template_catalog_version ?? company.template_catalog_version;
    if (enabled !== true || (language !== "ar" && language !== "en") ||
        bindingId === null || templateVersion === null) {
      return null;
    }

    const permission = await transaction.query<PermissionRow>(
      `SELECT id::text, revision, evidence_reference, collected_at,
              expires_at, withdrawn_at
       FROM outbound_messaging_permissions
       WHERE organization_id = $1 AND recipient_digest = $2
         AND purpose = 'INITIAL_GUEST_ACCESS'
       FOR SHARE`,
      [scope.organizationId, digest],
    );
    const grant = permission.rows[0];
    if (grant === undefined || grant.withdrawn_at !== null ||
        !(grant.expires_at instanceof Date) ||
        !Number.isSafeInteger(grant.revision) || grant.revision < 1) {
      return null;
    }
    const evidence = await transaction.query<{ action: string; evidence_reference: string }>(
      `SELECT action, evidence_reference FROM outbound_permission_events
       WHERE organization_id = $1 AND permission_id = $2 AND revision = $3
       FOR SHARE`,
      [scope.organizationId, grant.id, grant.revision],
    );
    if (evidence.rows[0]?.action !== "GRANT" ||
        evidence.rows[0]?.evidence_reference !== grant.evidence_reference) {
      return null;
    }

    const binding = await transaction.query<BindingRow>(
      `SELECT id::text, enabled, revision, environment, provider_verified_at
       FROM outbound_provider_bindings
       WHERE organization_id = $1 AND id = $2
         AND purpose = 'INITIAL_GUEST_ACCESS' AND provider = 'META_CLOUD'
       FOR SHARE`,
      [scope.organizationId, bindingId],
    );
    const authorizedBinding = binding.rows[0];
    if (authorizedBinding?.enabled !== true ||
        authorizedBinding.environment !== environment ||
        !(authorizedBinding.provider_verified_at instanceof Date) ||
        !Number.isFinite(authorizedBinding.provider_verified_at.getTime())) return null;

    const control = await transaction.query<{ issue_enabled: boolean }>(
      `SELECT issue_enabled FROM outbound_messaging_control
       WHERE environment = $1 FOR SHARE`,
      [environment],
    );
    if (control.rows[0]?.issue_enabled !== true) return null;

    const wallTime = await transaction.query<{ now: Date }>(
      "SELECT clock_timestamp() AS now",
    );
    const now = wallTime.rows[0]?.now;
    if (!(now instanceof Date) || grant.collected_at > now || grant.expires_at <= now ||
        authorizedBinding.provider_verified_at > now) {
      return null;
    }
    const governingPolicy = location ?? company;
    return {
      recipientDigest: digest,
      policyId: governingPolicy.id,
      permissionExpiresAt: grant.expires_at,
      permissionId: grant.id,
      permissionRevision: grant.revision,
      bindingId: authorizedBinding.id,
      bindingRevision: authorizedBinding.revision,
      policyRevision: governingPolicy.revision,
      companyPolicyRevision: company.revision,
      templateVersion,
      locale: language,
    };
  };
}
