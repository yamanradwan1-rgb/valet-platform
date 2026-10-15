import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { appendOrganizationAuditEvent } from "../audit/organization-audit-writer";
import { ManagementSettingsError } from "../management/management-settings-errors";
import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeCompanyAdminManagement } from "../management/management-authorization";
import { type WhatsAppPolicyMutation } from "./whatsapp-settings-validation";
import {
  availableTenantTemplateVersions, templateApprovedForAccount,
} from "./whatsapp-template-authority";

interface PolicyRow {
  enabled: boolean | null;
  language: "ar" | "en" | null;
  templateCatalogVersion: string | null;
  providerBindingId: string | null;
  revision: number;
}

const emptyPolicy: PolicyRow = {
  enabled: null, language: null, templateCatalogVersion: null,
  providerBindingId: null, revision: 0,
};

async function readPolicy(
  transaction: PostgresTransaction, org: string, location: string | null,
): Promise<PolicyRow> {
  const result = await transaction.query<PolicyRow>(
    `SELECT enabled,language,template_catalog_version AS "templateCatalogVersion",
      provider_binding_id::text AS "providerBindingId",revision
     FROM outbound_messaging_policies
     WHERE organization_id=$1 AND location_id IS NOT DISTINCT FROM $2::uuid
       AND purpose='INITIAL_GUEST_ACCESS'`,
    [org, location],
  );
  return result.rows[0] ?? emptyPolicy;
}

@Injectable()
export class WhatsAppSettingsService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  private execute(
    context: StaffSessionContext, org: string, location: string | null,
    sensitive: boolean,
    action: (
      tx: PostgresTransaction, actorMembershipId: string,
    ) => Promise<void>,
  ) {
    return inPostgresTransaction(this.pool, async (tx) => {
      const actor = await authorizeCompanyAdminManagement(tx, context, {
        organizationId: org,
        capability: location ? "LOCATION_SETTINGS_MANAGE_ELIGIBLE"
          : "COMPANY_SETTINGS_MANAGE_ELIGIBLE",
        assurance: sensitive ? "SENSITIVE" : "STANDARD",
        ...(location ? { targetLocationId: location, requireActiveLocation: false } : {}),
      });
      await action(tx, actor.membershipId);
      const policy = await readPolicy(tx, org, location);
      const companyDefault = location ? await readPolicy(tx, org, null) : null;
      const bindings = await tx.query<{
        id: string; wabaId: string; phoneNumberId: string; providerVerifiedAt: Date | null;
      }>(
        `SELECT id::text, waba_id AS "wabaId",phone_number_id AS "phoneNumberId",
           provider_verified_at AS "providerVerifiedAt"
         FROM outbound_provider_bindings
         WHERE organization_id=$1 AND provider='META_CLOUD'
         ORDER BY created_at,id LIMIT 30`, [org],
      );
      const mode = process.env.OUTBOUND_MESSAGING_MODE;
      const control = mode === "test" || mode === "production"
        ? await tx.query<{ sendEnabled: boolean }>(
          `SELECT send_enabled AS "sendEnabled" FROM outbound_messaging_control
           WHERE environment=$1`, [mode],
        ) : null;
      await recordAdminActivityInTransaction(tx, context);
      return {
        organizationId: org, locationId: location, policy, companyDefault,
        connections: bindings.rows.map(({ providerVerifiedAt, ...binding }) => ({
          ...binding,
          status: providerVerifiedAt === null ? "PENDING_META_VERIFICATION" as const
            : "VERIFIED" as const,
        })),
        approvedTemplateVersions: availableTenantTemplateVersions(
          process.env, org,
          bindings.rows.filter((row) => row.providerVerifiedAt !== null)
            .map((row) => row.wabaId),
        ),
        globalSendEnabled: control?.rows[0]?.sendEnabled === true &&
          process.env.OUTBOUND_MESSAGING_SEND_ENABLED === "true",
        activationReady: false as const,
      };
    });
  }

  read(context: StaffSessionContext, org: string, location: string | null) {
    return this.execute(context, org, location, false, async () => {});
  }

  write(
    context: StaffSessionContext, org: string, location: string | null,
    input: WhatsAppPolicyMutation,
  ) {
    return this.execute(context, org, location, true, async (tx, actorMembershipId) => {
      const companyDefault = location ? await readPolicy(tx, org, null) : null;
      const effectiveLanguage = input.language ?? companyDefault?.language ?? null;
      const effectiveVersion = input.templateCatalogVersion ??
        companyDefault?.templateCatalogVersion ?? null;
      const effectiveBindingId = input.providerBindingId ??
        companyDefault?.providerBindingId ?? null;
      if (input.enabled === true &&
        (!effectiveLanguage || !effectiveVersion || !effectiveBindingId))
        throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      if (input.providerBindingId) {
        const binding = await tx.query<{ waba_id: string }>(
          `SELECT waba_id FROM outbound_provider_bindings
           WHERE id=$1 AND organization_id=$2 AND provider='META_CLOUD'
             AND enabled AND provider_verified_at IS NOT NULL AND environment=$3`,
          [input.providerBindingId, org, process.env.OUTBOUND_MESSAGING_MODE],
        );
        if (binding.rowCount !== 1)
          throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      }
      if (effectiveVersion && effectiveLanguage && effectiveBindingId) {
        const account = await tx.query<{ waba_id: string }>(
          `SELECT waba_id FROM outbound_provider_bindings
           WHERE id=$1 AND organization_id=$2 AND provider='META_CLOUD'
             AND enabled AND provider_verified_at IS NOT NULL AND environment=$3`,
          [effectiveBindingId, org, process.env.OUTBOUND_MESSAGING_MODE],
        );
        if (input.enabled === true && (!account.rows[0] ||
          !templateApprovedForAccount(
            process.env, org, account.rows[0].waba_id,
            effectiveVersion, effectiveLanguage,
          ))) throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      }
      if (location === null && (input.enabled === null || input.language === null))
        throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      const current = await readPolicy(tx, org, location);
      if (current.revision !== input.expectedRevision)
        throw new ManagementSettingsError("CONFIGURATION_CONFLICT");
      if (current.revision === 0) {
        await tx.query(
          `INSERT INTO outbound_messaging_policies
           (organization_id,location_id,enabled,language,template_catalog_version,
            provider_binding_id,purpose) VALUES($1,$2,$3,$4,$5,$6,'INITIAL_GUEST_ACCESS')`,
          [org, location, input.enabled, input.language,
            input.templateCatalogVersion, input.providerBindingId],
        );
      } else {
        const result = await tx.query(
          `UPDATE outbound_messaging_policies
             SET enabled=$4,language=$5,template_catalog_version=$6,
                 provider_binding_id=$7,revision=revision+1,
                 updated_at=clock_timestamp()
           WHERE organization_id=$1 AND location_id IS NOT DISTINCT FROM $2::uuid
             AND revision=$3 AND purpose='INITIAL_GUEST_ACCESS'`,
          [org, location, input.expectedRevision, input.enabled,
            input.language, input.templateCatalogVersion, input.providerBindingId],
        );
        if (result.rowCount !== 1)
          throw new ManagementSettingsError("CONFIGURATION_CONFLICT");
      }
      await appendOrganizationAuditEvent(tx, {
        actor: { type: "MEMBERSHIP", membershipId: actorMembershipId },
        eventId: randomUUID(),
        eventType: location === null ? "MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED"
          : "MANAGEMENT_LOCATION_SETTING_OVERRIDE_CHANGED",
        entityType: location === null ? "Organization" : "Location",
        entityId: location ?? org,
        organizationId: org,
        occurredAt: new Date(),
        allowedMetadataKeys: ["setting", "revision", "enabled"],
        metadata: {
          setting: "WHATSAPP_GUEST_ACCESS",
          revision: input.expectedRevision + 1,
          enabled: input.enabled,
        },
      });
    });
  }
}
