import { randomUUID } from "node:crypto";

import type {
  WebPushAudience,
  WebPushSubscriptionRequest,
  WebPushSubscriptionResponse,
} from "@valet/contracts";
import type { WebPushServerConfig } from "@valet/config";

import type { PostgresTransaction } from "../../common/database/postgres";
import {
  encryptWebPushCredentials,
  fingerprintWebPushEndpoint,
} from "../../common/web-push/subscription-crypto";
import type { WebPushSubscriptionAuthority } from "./web-push-subscription-authority";
import { disableIneligibleWebPushBinding } from "./web-push-binding-cleanup";
import {
  WebPushSubscriptionConflictError,
  WebPushSubscriptionNotAvailableError,
  WebPushUnavailableError,
} from "./web-push-subscription-errors";

interface SubscriptionRow {
  readonly audience: WebPushAudience;
  readonly browser_expires_at: Date | null;
  readonly created_at: Date;
  readonly disabled_at: Date | null;
  readonly guest_access_generation: string | null;
  readonly guest_valet_session_id: string | null;
  readonly id: string;
  readonly locale: "ar" | "en";
  readonly staff_auth_session_id: string | null;
  readonly updated_at: Date;
}

const projection = `id::text, audience::text, browser_expires_at, locale,
  staff_auth_session_id::text, guest_valet_session_id::text,
  guest_access_generation::text, disabled_at, created_at, updated_at`;

export class WebPushSubscriptionRepository {
  constructor(private readonly config: WebPushServerConfig) {}

  async mutate(
    transaction: PostgresTransaction,
    input: WebPushSubscriptionRequest,
    authority: WebPushSubscriptionAuthority,
    targetId?: string,
  ): Promise<WebPushSubscriptionResponse> {
    const { fingerprintKey, keyring } = this.enabledConfig();
    if (targetId !== undefined) {
      const target = await this.load(transaction, targetId);
      if (target === undefined || !this.owns(target, authority)) {
        throw new WebPushSubscriptionNotAvailableError();
      }
    }
    const fingerprint = fingerprintWebPushEndpoint(
      input.endpoint,
      fingerprintKey,
    );
    await transaction.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [fingerprint],
    );
    let active = await this.activeByEndpoint(transaction, fingerprint);
    if (
      active !== undefined &&
      (await disableIneligibleWebPushBinding(transaction, active))
    ) {
      active = undefined;
    }
    if (active !== undefined && !this.owns(active, authority)) {
      throw new WebPushSubscriptionConflictError();
    }
    const id = targetId ?? active?.id ?? randomUUID();
    if (targetId !== undefined) {
      const locked = await this.load(transaction, targetId, true);
      if (
        locked === undefined ||
        locked.disabled_at !== null ||
        !this.owns(locked, authority) ||
        (active !== undefined && active.id !== targetId)
      ) {
        throw new WebPushSubscriptionNotAvailableError();
      }
    }
    const encrypted = encryptWebPushCredentials(
      {
        auth: input.auth,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        subscriptionId: id,
      },
      keyring,
    );
    const row =
      active === undefined && targetId === undefined
        ? await this.insert(
            transaction,
            id,
            fingerprint,
            encrypted,
            input,
            authority,
          )
        : await this.update(transaction, id, fingerprint, encrypted, input);
    if (row === undefined) throw new WebPushSubscriptionConflictError();
    return this.response(row);
  }

  async disable(
    transaction: PostgresTransaction,
    subscriptionId: string,
    authority: WebPushSubscriptionAuthority,
  ): Promise<WebPushSubscriptionResponse> {
    this.enabledConfig();
    const target = await this.load(transaction, subscriptionId);
    if (target === undefined || !this.owns(target, authority)) {
      throw new WebPushSubscriptionNotAvailableError();
    }
    const locked = await this.load(transaction, subscriptionId, true);
    if (locked === undefined || !this.owns(locked, authority)) {
      throw new WebPushSubscriptionNotAvailableError();
    }
    if (locked.disabled_at !== null) return this.response(locked);
    const result = await transaction.query<SubscriptionRow>(
      `UPDATE web_push_subscriptions
       SET disabled_at = transaction_timestamp(), disabled_reason = 'UNSUBSCRIBED',
           endpoint_ciphertext = NULL, p256dh_ciphertext = NULL,
           auth_ciphertext = NULL, encryption_key_version = NULL,
           updated_at = transaction_timestamp()
       WHERE id = $1 RETURNING ${projection}`,
      [subscriptionId],
    );
    return this.response(result.rows[0]!);
  }

  private enabledConfig() {
    if (
      !this.config.enabled ||
      this.config.endpointFingerprintKey === undefined ||
      this.config.storageKeys === undefined
    ) {
      throw new WebPushUnavailableError();
    }
    return {
      fingerprintKey: this.config.endpointFingerprintKey,
      keyring: this.config.storageKeys,
    };
  }

  private owns(
    row: SubscriptionRow,
    authority: WebPushSubscriptionAuthority,
  ): boolean {
    return authority.audience === "EMPLOYEE"
      ? row.audience === "EMPLOYEE" &&
          row.staff_auth_session_id === authority.staffAuthSessionId
      : row.audience === "GUEST" &&
          row.guest_valet_session_id === authority.guestValetSessionId &&
          row.guest_access_generation === authority.guestAccessGeneration;
  }

  private response(row: SubscriptionRow): WebPushSubscriptionResponse {
    return {
      audience: row.audience,
      browserExpiresAt: row.browser_expires_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      id: row.id,
      locale: row.locale,
      status: row.disabled_at === null ? "ACTIVE" : "DISABLED",
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async load(
    transaction: PostgresTransaction,
    id: string,
    lock = false,
  ): Promise<SubscriptionRow | undefined> {
    const result = await transaction.query<SubscriptionRow>(
      `SELECT ${projection} FROM web_push_subscriptions
       WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    return result.rows[0];
  }

  private async activeByEndpoint(
    transaction: PostgresTransaction,
    fingerprint: string,
  ): Promise<SubscriptionRow | undefined> {
    const result = await transaction.query<SubscriptionRow>(
      `SELECT ${projection} FROM web_push_subscriptions
       WHERE endpoint_fingerprint = $1 AND disabled_at IS NULL FOR UPDATE`,
      [fingerprint],
    );
    return result.rows[0];
  }

  private async insert(
    transaction: PostgresTransaction,
    id: string,
    fingerprint: string,
    encrypted: ReturnType<typeof encryptWebPushCredentials>,
    input: WebPushSubscriptionRequest,
    authority: WebPushSubscriptionAuthority,
  ): Promise<SubscriptionRow | undefined> {
    const principal =
      authority.audience === "EMPLOYEE"
        ? [authority.staffAuthSessionId, null, null]
        : [
            null,
            authority.guestValetSessionId,
            authority.guestAccessGeneration,
          ];
    const result = await transaction.query<SubscriptionRow>(
      `INSERT INTO web_push_subscriptions
         (id, audience, endpoint_fingerprint, endpoint_ciphertext,
          p256dh_ciphertext, auth_ciphertext, encryption_key_version,
          browser_expires_at, locale, staff_auth_session_id,
          guest_valet_session_id, guest_access_generation, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               transaction_timestamp()) RETURNING ${projection}`,
      this.parameters(
        id,
        authority.audience,
        fingerprint,
        encrypted,
        input,
        principal,
      ),
    );
    return result.rows[0];
  }

  private async update(
    transaction: PostgresTransaction,
    id: string,
    fingerprint: string,
    encrypted: ReturnType<typeof encryptWebPushCredentials>,
    input: WebPushSubscriptionRequest,
  ): Promise<SubscriptionRow | undefined> {
    const result = await transaction.query<SubscriptionRow>(
      `UPDATE web_push_subscriptions
       SET endpoint_fingerprint = $2, endpoint_ciphertext = $3,
           p256dh_ciphertext = $4, auth_ciphertext = $5,
           encryption_key_version = $6, browser_expires_at = $7,
           locale = $8, updated_at = transaction_timestamp()
       WHERE id = $1 AND disabled_at IS NULL RETURNING ${projection}`,
      [
        id,
        fingerprint,
        encrypted.endpointCiphertext,
        encrypted.p256dhCiphertext,
        encrypted.authCiphertext,
        encrypted.encryptionKeyVersion,
        input.browserExpiresAt == null
          ? null
          : new Date(input.browserExpiresAt),
        input.locale,
      ],
    );
    return result.rows[0];
  }

  private parameters(
    id: string,
    audience: WebPushAudience,
    fingerprint: string,
    encrypted: ReturnType<typeof encryptWebPushCredentials>,
    input: WebPushSubscriptionRequest,
    principal: unknown[],
  ): unknown[] {
    return [
      id,
      audience,
      fingerprint,
      encrypted.endpointCiphertext,
      encrypted.p256dhCiphertext,
      encrypted.authCiphertext,
      encrypted.encryptionKeyVersion,
      input.browserExpiresAt == null ? null : new Date(input.browserExpiresAt),
      input.locale,
      ...principal,
    ];
  }
}
