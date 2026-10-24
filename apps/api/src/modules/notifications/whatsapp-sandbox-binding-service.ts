import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { appendOrganizationAuditEvent } from "../audit/organization-audit-writer";
import { authorizeCompanyAdminManagement } from "../management/management-authorization";
import { ManagementSettingsError } from "../management/management-settings-errors";
import { META_SANDBOX_WABA_ID, META_SANDBOX_PHONE_ID } from "./config/meta-sandbox-assets";
import { sandboxBindingRequestAllowed } from "./whatsapp-sandbox-binding-input";

const alias = "wa310-meta-sandbox";

@Injectable()
export class WhatsAppSandboxBindingService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  requestPending(context: StaffSessionContext, org: string) {
    return inPostgresTransaction(this.pool, async (tx) => {
      const actor = await authorizeCompanyAdminManagement(tx, context, {
        organizationId: org,
        capability: "COMPANY_SETTINGS_MANAGE_ELIGIBLE",
        assurance: "SENSITIVE",
      });
      const identity = await tx.query<{ database: string }>(
        "SELECT current_database() AS database",
      );
      if (!sandboxBindingRequestAllowed(
        process.env, org, identity.rows[0]?.database ?? "",
      )) throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");

      const controls = await tx.query<{ environment: string }>(
        `SELECT environment FROM outbound_messaging_control
         WHERE issue_enabled=false AND send_enabled=false
         ORDER BY environment`,
      );
      if (controls.rowCount !== 2 || controls.rows[0]?.environment !== "production" ||
          controls.rows[1]?.environment !== "test") {
        throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      }

      const existing = await tx.query<{
        id: string; waba: string; phone: string; enabled: boolean;
        verified: Date | null; configAlias: string;
      }>(
        `SELECT id::text,waba_id AS waba,phone_number_id AS phone,
          enabled,provider_verified_at AS verified,config_alias AS "configAlias"
         FROM outbound_provider_bindings
         WHERE organization_id=$1 AND environment='test' AND purpose='INITIAL_GUEST_ACCESS'
         `, [org],
      );
      if ((existing.rowCount ?? existing.rows.length) > 1) {
        throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      }
      const previous = existing.rows[0];
      if (previous !== undefined) {
        if (previous.waba !== META_SANDBOX_WABA_ID ||
            previous.phone !== META_SANDBOX_PHONE_ID ||
            previous.configAlias !== alias ||
            previous.enabled || previous.verified !== null) {
          throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
        }
        await recordAdminActivityInTransaction(tx, context);
        return { bindingId: previous.id, status: "PENDING_META_VERIFICATION" as const };
      }

      const id = randomUUID();
      await tx.query(
        `INSERT INTO outbound_provider_bindings
         (id,organization_id,purpose,provider,environment,waba_id,phone_number_id,config_alias)
         VALUES($1,$2,'INITIAL_GUEST_ACCESS','META_CLOUD','test',$3,$4,$5)
         ON CONFLICT DO NOTHING`,
        [id,org,META_SANDBOX_WABA_ID,META_SANDBOX_PHONE_ID,alias],
      );
      const actual = await tx.query<{ id: string }>(
        `SELECT id::text FROM outbound_provider_bindings
         WHERE organization_id=$1 AND environment='test'
           AND waba_id=$2 AND phone_number_id=$3
           AND config_alias=$4 AND enabled=false AND provider_verified_at IS NULL`,
        [org,META_SANDBOX_WABA_ID,META_SANDBOX_PHONE_ID,alias],
      );
      if (actual.rowCount !== 1) {
        throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      }
      if (actual.rows[0]?.id !== id) {
        await recordAdminActivityInTransaction(tx, context);
        return { bindingId: actual.rows[0]!.id, status: "PENDING_META_VERIFICATION" as const };
      }
      await appendOrganizationAuditEvent(tx, {
        actor: { type: "MEMBERSHIP", membershipId: actor.membershipId },
        eventId: randomUUID(),
        eventType: "WHATSAPP_SANDBOX_BINDING_REQUESTED",
        entityType: "OutboundProviderBinding",
        entityId: id,
        organizationId: org,
        occurredAt: new Date(),
        allowedMetadataKeys: ["provider","environment","verified","enabled"],
        metadata: {
          provider: "META_CLOUD", environment: "test", verified: false, enabled: false,
        },
      });
      await recordAdminActivityInTransaction(tx, context);
      return { bindingId: id, status: "PENDING_META_VERIFICATION" as const };
    });
  }
}
