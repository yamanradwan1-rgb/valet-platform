import { randomBytes, randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import argon2 from "argon2";

import { AppModule } from "../src/app.module";
import { DigitalPaymentProviderRegistry } from "../src/modules/payments/digital-payment-provider";
import { createInitializePaymentExecutor } from "../src/modules/payments/initialize-payment-command";
import type { HandoffFixture } from "./handoff-test-context";
import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

interface RequestOptions {
  readonly authorization?: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface Phase6HttpResult {
  readonly body: Record<string, unknown> | undefined;
  readonly status: number;
}

const allowedOrigin = "https://phase6-core.valet.test";
const password = "phase 6 core gate password";

export class Phase6CoreE2ETestContext extends CompleteHandoffTestContext {
  private app!: INestApplication;
  private baseUrl = "";
  private passwordHash = "";
  private readonly previousEnvironment = new Map<string, string | undefined>();

  constructor(label: string) {
    super(`008h_${label}`);
  }

  async setupApi(): Promise<void> {
    await this.setup();
    this.setEnvironment("DATABASE_URL", this.runtimeUrl);
    this.setEnvironment("STAFF_AUTH_ALLOWED_ORIGINS", allowedOrigin);
    this.passwordHash = await argon2.hash(password, {
      hashLength: 32,
      memoryCost: 65_536,
      parallelism: 4,
      salt: randomBytes(16),
      timeCost: 3,
      type: argon2.argon2id,
      version: 19,
    });
    this.app = await NestFactory.create(AppModule, {
      abortOnError: false,
      logger: false,
    });
    await this.app.listen(0, "127.0.0.1");
    const address = this.app.getHttpServer().address() as { port: number };
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async teardownApi(): Promise<void> {
    if (this.app !== undefined) await this.app.close();
    for (const [name, value] of this.previousEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await this.teardown();
  }

  providerRegistry(): DigitalPaymentProviderRegistry {
    return this.app.get(DigitalPaymentProviderRegistry);
  }

  async configureCustomerCash(fixture: HandoffFixture): Promise<void> {
    await this.adminPool.query(
      `UPDATE organizations
       SET valet_service_fee = 5, payment_service_payer = 'CUSTOMER',
           payment_methods_policy = 'CASH_ONLY', release_requires_payment = true,
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [fixture.organizationId],
    );
  }

  initialize(fixture: HandoffFixture) {
    return createInitializePaymentExecutor(this.runtimePool)({
      creationIdempotencyKey: randomUUID(),
      valetSessionId: fixture.sessionId,
    });
  }

  async login(fixture: HandoffFixture): Promise<string> {
    return await this.loginUser(fixture.userId);
  }

  async loginManager(fixture: HandoffFixture): Promise<string> {
    const manager = await this.addMember(fixture, "LOCATION_MANAGER", false);
    return await this.loginUser(manager.userId);
  }

  private async loginUser(userId: string): Promise<string> {
    const identity = await this.adminPool.query<{ email: string }>(
      `UPDATE users SET password_hash = $2, updated_at = transaction_timestamp()
       WHERE id = $1 RETURNING email`,
      [userId, this.passwordHash],
    );
    const response = await this.request("POST", "/v1/staff/auth/login", {
      body: { email: identity.rows[0]!.email, password },
      headers: { Origin: allowedOrigin },
    });
    if (response.status !== 200) throw new Error("Phase 6 test login failed.");
    return response.body!.accessToken as string;
  }

  request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Phase6HttpResult> {
    const headers: Record<string, string> = {
      "X-Request-Id": randomUUID(),
      ...options.headers,
    };
    if (options.authorization !== undefined) {
      headers.Authorization = options.authorization;
    }
    if (options.body !== undefined)
      headers["Content-Type"] = "application/json";
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    }).then(async (response) => {
      const text = await response.text();
      return {
        body:
          text === ""
            ? undefined
            : (JSON.parse(text) as Record<string, unknown>),
        status: response.status,
      };
    });
  }

  async financialHistory(fixture: HandoffFixture) {
    const result = await this.adminPool.query<{
      amount_paid: string;
      cash_count: number;
      payment_status: string;
      refund_count: number;
      session_state: string;
    }>(
      `SELECT payment.amount_paid::text, payment.status::text AS payment_status,
              session.state::text AS session_state,
              (SELECT count(*)::integer FROM cash_entries
               WHERE payment_id = payment.id) AS cash_count,
              (SELECT count(*)::integer FROM refunds
               WHERE payment_id = payment.id) AS refund_count
       FROM payments AS payment
       INNER JOIN valet_sessions AS session ON session.id = payment.valet_session_id
       WHERE payment.valet_session_id = $1`,
      [fixture.sessionId],
    );
    return result.rows[0]!;
  }

  async financialSurfaceCounts(fixture: HandoffFixture) {
    const result = await this.adminPool.query(
      `SELECT
         (SELECT count(*)::integer FROM payments
          WHERE valet_session_id = $1) AS payments,
         (SELECT count(*)::integer FROM validations AS child
          INNER JOIN payments AS parent ON parent.id = child.payment_id
          WHERE parent.valet_session_id = $1) AS validations,
         (SELECT count(*)::integer FROM cash_entries AS child
          INNER JOIN payments AS parent ON parent.id = child.payment_id
          WHERE parent.valet_session_id = $1) AS cash_entries,
         (SELECT count(*)::integer FROM payment_collection_operations AS child
          INNER JOIN payments AS parent ON parent.id = child.payment_id
          WHERE parent.valet_session_id = $1) AS collection_operations,
         (SELECT count(*)::integer FROM payment_provider_events AS child
          INNER JOIN payments AS parent ON parent.id = child.payment_id
          WHERE parent.valet_session_id = $1) AS provider_events,
         (SELECT count(*)::integer FROM refunds AS child
          INNER JOIN payments AS parent ON parent.id = child.payment_id
          WHERE parent.valet_session_id = $1) AS refunds,
         (SELECT count(*)::integer FROM audit_events
          WHERE valet_session_id = $1) AS audits`,
      [fixture.sessionId],
    );
    return result.rows[0]!;
  }

  private setEnvironment(name: string, value: string): void {
    if (!this.previousEnvironment.has(name)) {
      this.previousEnvironment.set(name, process.env[name]);
    }
    process.env[name] = value;
  }
}
