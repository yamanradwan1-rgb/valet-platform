import type { PostgresPool } from "../../../common/database/postgres";
import type { OutboundClaim, OutboundLeaseRepository, DispatchPreparation } from "../contracts/outbound-lease";
import type { OutboundSendResult } from "../contracts/outbound-provider";
import type { MetaAuthorizedAttempt } from "../config/meta-cloud-policy";
import type { OutboundPermitTransportSource, OutboundTransportMaterial } from "./outbound-transport-source";
import { equalRecipientDigest, permittedSenderMaterial } from "./outbound-postgres-permit";
import type {
  OutboundPgClaimRow, OutboundPgPermitRow, OutboundPgRecipientRow,
  ResolveOutboundSenderConfig,
} from "./outbound-postgres-types";

function finiteReason(result: OutboundSendResult): {
  readonly outcome: string;
  readonly messageId: string | null;
  readonly safeCode: string | null;
} {
  switch (result.kind) {
    case "ACCEPTED":
      return { outcome: "ACCEPTED", messageId: result.providerMessageId, safeCode: null };
    case "NOT_ACCEPTED":
      return { outcome: "DEFINITIVE_FAILURE", messageId: null,
        safeCode: result.reason === "RATE_LIMIT" ? "RATE_LIMIT" : "REJECTED" };
    case "PERMANENT":
      return { outcome: "PERMANENT_FAILURE", messageId: null,
        safeCode: result.reason === "RECIPIENT" ? "INVALID_RECIPIENT" :
          result.reason === "TEMPLATE" ? "INVALID_TEMPLATE" : "CONFIGURATION" };
    case "UNKNOWN":
      return { outcome: "UNKNOWN", messageId: null,
        safeCode: result.reason === "TIMEOUT" ? "TIMEOUT" :
          result.reason === "TRANSPORT" ? "NETWORK" : "UNKNOWN" };
  }
}

interface PreparedMaterial {
  readonly leaseToken: string;
  readonly deliveryId: string;
  readonly recipientDigest: string;
  readonly value: OutboundTransportMaterial;
  readonly authorizedMeta: MetaAuthorizedAttempt | null;
  readonly expiresAtMs: number;
  confirmed: boolean;
}

/** W1 SECURITY DEFINER functions own all mutation, rate budgets and locking. */
export class PostgresOutboundLeaseRepository
implements OutboundLeaseRepository, OutboundPermitTransportSource {
  private readonly prepared = new Map<string, PreparedMaterial>();
  private readonly handles = new Map<string, string>();

  constructor(
    private readonly pool: PostgresPool,
    private readonly digestRecipient: (recipientE164: string) => string,
    private readonly resolveConfig: ResolveOutboundSenderConfig,
  ) {}

  async claimDue(limit: number): Promise<readonly OutboundClaim[]> {
    const { rows } = await this.pool.query<OutboundPgClaimRow>(
      "SELECT delivery_id, lease_token, lease_expires_at FROM public.outbound_claim_due($1)",
      [limit],
    );
    return rows.map((row) => ({
      deliveryId: row.delivery_id,
      leaseToken: row.lease_token,
      leaseExpiresAt: row.lease_expires_at,
    }));
  }

  async prepareDispatch(claim: OutboundClaim): Promise<DispatchPreparation> {
    const recipient = await this.pool.query<OutboundPgRecipientRow>(
      "SELECT phone_normalized, recipient_digest FROM public.outbound_lease_recipient($1,$2)",
      [claim.deliveryId, claim.leaseToken],
    );
    const before = recipient.rows[0];
    if (before === undefined) return { kind: "LOST_LEASE" };
    const actualDigest = this.digestRecipient(before.phone_normalized);
    if (!equalRecipientDigest(actualDigest, before.recipient_digest)) {
      return { kind: "SUPPRESSED" };
    }

    let row: OutboundPgPermitRow | undefined;
    // The SQL remaining_seconds value is measured inside the pending query.
    // Anchor its projected expiry before the query so transport/configuration
    // latency can only shorten the sender's local deadline, never extend it.
    const permitQueryStartedMs = Date.now();
    try {
      const permitted = await this.pool.query<OutboundPgPermitRow>(
        "SELECT * FROM public.outbound_dispatch_permit($1,$2,$3)",
        [claim.deliveryId, claim.leaseToken, actualDigest],
      );
      row = permitted.rows[0];
    } catch (error) {
      // W1 emits finite SQLSTATE for expected eligibility failures. A caller
      // must never infer a successful dispatch from failed authorization.
      if (
        error !== null && typeof error === "object" &&
        "code" in error && error.code === "P0001"
      ) {
        const reason = "message" in error ? error.message : undefined;
        if (
          reason === "OUTBOUND_BUDGET_EXHAUSTED" ||
          reason === "OUTBOUND_RECIPIENT_THROTTLED"
        ) {
          await this.pool.query(
            "SELECT public.outbound_release_lease($1,$2,clock_timestamp()+interval '30 seconds')",
            [claim.deliveryId, claim.leaseToken],
          );
          return { kind: "RATE_LIMITED" };
        }
        return { kind: "LOST_LEASE" };
      }
      throw error;
    }
    if (row === undefined) return { kind: "LOST_LEASE" };

    const config = await this.resolveConfig({
      organizationId: row.organization_id,
      locationId: row.location_id,
      bindingId: row.binding_id,
      phoneNumberId: row.phone_number_id,
      wabaId: row.waba_id,
      configAlias: row.config_alias,
      environment: row.provider_environment,
      templateVersion: row.template_catalog_version,
      language: row.language,
    });
    if (config === undefined) {
      throw new Error("OUTBOUND_SENDER_CONFIGURATION_NOT_READY");
    }
    const value = permittedSenderMaterial(row, config);
    if (
      !equalRecipientDigest(row.recipient_digest, actualDigest) ||
      row.phone_normalized !== before.phone_normalized
    ) {
      throw new Error("OUTBOUND_RECIPIENT_CHANGED_DURING_PERMIT");
    }
    const seconds = Number(row.remaining_seconds);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 30 * 60) {
      throw new Error("OUTBOUND_PERMIT_DEADLINE_INVALID");
    }
    const expiresAtMs = permitQueryStartedMs + seconds * 1_000;
    this.prepared.set(row.attempt_id, {
      leaseToken: claim.leaseToken,
      deliveryId: claim.deliveryId,
      recipientDigest: actualDigest,
      value,
      authorizedMeta: config.sandbox ? {
        organizationId: row.organization_id,
        locationId: row.location_id,
        bindingId: row.binding_id,
        configAlias: row.config_alias,
        environment: row.provider_environment,
        wabaId: row.waba_id,
        phoneNumberId: row.phone_number_id,
        accessToken: config.accessToken,
        enabled: true,
        recipientE164: row.phone_normalized,
        customerOrigin: config.sandbox.customerOrigin,
        template: config.sandbox.template,
        testRecipientAllowlist: [config.sandbox.allowedRecipient],
      } : null,
      expiresAtMs,
      confirmed: false,
    });
    this.handles.set(row.callback_handle, row.attempt_id);
    return {
      kind: "DISPATCH",
      attemptId: row.attempt_id,
      attemptHandle: row.callback_handle,
      remainingMs: Math.max(0, Math.floor(expiresAtMs - Date.now())),
    };
  }

  async loadForPermit(
    claim: OutboundClaim,
    attemptId: string,
  ): Promise<OutboundTransportMaterial | undefined> {
    const entry = this.prepared.get(attemptId);
    return entry?.deliveryId === claim.deliveryId && entry.leaseToken === claim.leaseToken
      ? entry.value : undefined;
  }

  async confirmPermit(
    claim: OutboundClaim,
    attemptId: string,
  ): Promise<{ readonly remainingMs: number } | undefined> {
    const stored = this.prepared.get(attemptId);
    if (!stored || stored.leaseToken !== claim.leaseToken ||
      stored.deliveryId !== claim.deliveryId) return undefined;
    const result = await this.pool.query<{ allowed: boolean }>(
      "SELECT public.outbound_confirm_dispatch($1,$2,$3,$4,$5) AS allowed",
      [claim.deliveryId, claim.leaseToken, attemptId, stored.recipientDigest,
        stored.value.recipientE164],
    );
    // The SQL confirm gate independently checks DB wall time > provider timeout.
    if (result.rows[0]?.allowed !== true) return undefined;
    // Use the DB permit's deadline projection, reduced by time spent in
    // this process, instead of treating a Boolean confirm as a fresh 10s TTL.
    const remainingMs = Math.floor(stored.expiresAtMs - Date.now());
    if (remainingMs <= 12_000) return undefined;
    stored.confirmed = true;
    return { remainingMs };
  }

  forgetPermit(attemptId: string): void {
    for (const [handle, id] of this.handles) {
      if (id === attemptId) this.handles.delete(handle);
    }
    this.prepared.delete(attemptId);
  }

  /** A committed, current SQL dispatch permit is the only source of Meta authority. */
  async resolveAuthorizedMetaAttempt(handle: string): Promise<MetaAuthorizedAttempt | null> {
    const id = this.handles.get(handle);
    const prepared = id === undefined ? undefined : this.prepared.get(id);
    if (!prepared?.confirmed || prepared.expiresAtMs <= Date.now() + 10_000 ||
        !prepared.authorizedMeta) return null;
    // Re-read current SQL authorization immediately before the provider call.
    // The earlier permit alone cannot authorize after consent/policy revocation.
    const check = await this.pool.query<{ allowed: boolean }>(
      "SELECT public.outbound_confirm_dispatch($1,$2,$3,$4,$5) AS allowed",
      [prepared.deliveryId, prepared.leaseToken, id,
        prepared.recipientDigest, prepared.value.recipientE164],
    );
    if (check.rows[0]?.allowed !== true ||
        prepared.expiresAtMs <= Date.now() + 12_000) return null;
    return prepared.authorizedMeta;
  }

  async finalizeAttempt(
    claim: OutboundClaim,
    attemptId: string,
    result: OutboundSendResult,
  ): Promise<void> {
    const outcome = finiteReason(result);
    const retryAfterSeconds = result.kind === "NOT_ACCEPTED"
      ? result.retryAfterSeconds ?? null : null;
    try {
      const updated = await this.pool.query<{ finished: boolean }>(
        "SELECT public.outbound_finish_attempt($1,$2,$3,$4,$5,$6,$7) AS finished",
        [claim.deliveryId, claim.leaseToken, attemptId,
          outcome.outcome, outcome.messageId, outcome.safeCode, retryAfterSeconds],
      );
      if (updated.rows[0]?.finished !== true) {
        throw new Error("OUTBOUND_FINALIZE_FENCE_LOST");
      }
    } finally {
      this.forgetPermit(attemptId);
    }
  }

  async expireAndPurge(limit: number): Promise<number> {
    // Recovery must first terminalize abandoned DISPATCHING (UNKNOWN) without
    // reopening a transport permit. W1 owns this restricted function.
    const recovered = await this.pool.query<{ recovered: number }>(
      "SELECT public.outbound_recover_expired($1) AS recovered", [limit],
    );
    const purged = await this.pool.query<{ purged: number }>(
      "SELECT public.outbound_purge_expired_envelopes($1) AS purged", [limit],
    );
    return (recovered.rows[0]?.recovered ?? 0) + (purged.rows[0]?.purged ?? 0);
  }
}
