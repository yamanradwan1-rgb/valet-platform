import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { appendOrganizationAuditEvent } from "../audit/organization-audit-writer";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { authorizeCompanyAdminManagement } from "../management/management-authorization";
import { ManagementSettingsError } from "../management/management-settings-errors";
import { createRecipientDigestFactory } from "./issuance/initial-guest-crypto";
import {
  type SandboxConsentInput, sandboxConsentScopeAllowed,
} from "./whatsapp-sandbox-consent-input";

@Injectable()
export class WhatsAppSandboxConsentService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  change(context: StaffSessionContext, org: string, input: SandboxConsentInput) {
    return inPostgresTransaction(this.pool, async (tx) => {
      const actor = await authorizeCompanyAdminManagement(tx, context, {
        organizationId: org, capability: "COMPANY_SETTINGS_MANAGE_ELIGIBLE",
        assurance: "SENSITIVE",
      });
      const database = await tx.query<{ name: string }>(
        "SELECT current_database() AS name",
      );
      if (!sandboxConsentScopeAllowed(
        process.env, org, database.rows[0]?.name ?? "",
      )) throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      const recipient = process.env.OUTBOUND_META_TEST_RECIPIENT_E164;
      const key = process.env.OUTBOUND_RECIPIENT_HMAC_KEY_BASE64;
      const version = process.env.OUTBOUND_RECIPIENT_HMAC_KEY_VERSION;
      if (!recipient || !key || !version || recipient.length > 16) {
        throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      }
      let digest: string;
      try {
        digest = createRecipientDigestFactory(key, version)(recipient);
      } catch {
        throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      }

      if (input.action === "GRANT") {
        const control = await tx.query<{ environment: string }>(
          `SELECT environment FROM outbound_messaging_control
           WHERE issue_enabled=false AND send_enabled=false ORDER BY environment`,
        );
        if (control.rowCount !== 2 ||
            control.rows[0]?.environment !== "production" ||
            control.rows[1]?.environment !== "test") {
          throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
        }
      }
      const changed = await tx.query<{ id: string }>(
        `SELECT outbound_permission_change(
           $1::uuid,$2::text,$3::text,
           CASE WHEN $5::text='GRANT' THEN clock_timestamp() - interval '1 second'
             ELSE NULL::timestamptz END,
           CASE WHEN $5::text='GRANT' THEN clock_timestamp() + interval '7 days'
             ELSE NULL::timestamptz END,
           $4::integer,$5::text)::text AS id`,
        [org,digest,input.evidenceReference,input.expectedRevision,input.action],
      );
      const permissionId = changed.rows[0]?.id;
      if (!permissionId) {
        throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
      }
      await appendOrganizationAuditEvent(tx, {
        actor: {type:"MEMBERSHIP",membershipId:actor.membershipId},
        eventId: randomUUID(),
        eventType: input.action === "GRANT" ? "WHATSAPP_SANDBOX_CONSENT_GRANTED"
          : "WHATSAPP_SANDBOX_CONSENT_WITHDRAWN",
        entityType: "OutboundPermission",
        entityId: permissionId,
        organizationId: org,
        occurredAt: new Date(),
        allowedMetadataKeys: ["action","revision"],
        metadata: {action:input.action,revision:input.expectedRevision + 1},
      });
      await recordAdminActivityInTransaction(tx, context);
      return {
        permissionId,
        revision: input.expectedRevision + 1,
        status: input.action === "GRANT" ? "GRANTED" as const : "WITHDRAWN" as const,
      };
    });
  }
}
