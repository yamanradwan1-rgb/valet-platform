import { Inject, Injectable } from "@nestjs/common";
import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeCompanyAdminManagement } from "../management/management-authorization";
import {
  approvedTemplateVersions, type WhatsAppPolicyMutation,
} from "./whatsapp-settings-validation";

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
    sensitive: boolean, action: (tx: PostgresTransaction) => Promise<void>,
  ) {
    return inPostgresTransaction(this.pool, async (tx) => {
      await authorizeCompanyAdminManagement(tx, context, {
        organizationId: org,
        capability: location ? "LOCATION_SETTINGS_MANAGE_ELIGIBLE"
          : "COMPANY_SETTINGS_MANAGE_ELIGIBLE",
        assurance: sensitive ? "SENSITIVE" : "STANDARD",
        ...(location ? { targetLocationId: location, requireActiveLocation: false } : {}),
      });
      await action(tx);
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
        approvedTemplateVersions: approvedTemplateVersions(process.env),
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
    return this.execute(context, org, location, true, async (tx) => {
      const allowed = approvedTemplateVersions(process.env);
      if (input.templateCatalogVersion &&
          !allowed.includes(input.templateCatalogVersion)) {
        throw new Error("WHATSAPP_TEMPLATE_NOT_APPROVED");
      }
      if (input.providerBindingId) {
        const binding = await tx.query(
          `SELECT 1 FROM outbound_provider_bindings
           WHERE id=$1 AND organization_id=$2 AND provider='META_CLOUD'`,
          [input.providerBindingId, org],
        );
        if (binding.rowCount !== 1) throw new Error("WHATSAPP_BINDING_NOT_AVAILABLE");
      }
      if (location === null && (input.enabled === null || input.language === null))
        throw new Error("WHATSAPP_COMPANY_DEFAULT_REQUIRED");
      const current = await readPolicy(tx, org, location);
      if (current.revision !== input.expectedRevision)
        throw new Error("WHATSAPP_SETTINGS_CONFLICT");
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
        if (result.rowCount !== 1) throw new Error("WHATSAPP_SETTINGS_CONFLICT");
      }
    });
  }
}
