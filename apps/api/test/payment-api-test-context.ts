import { randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import argon2 from "argon2";

import { AppModule } from "../src/app.module";
import type { PaymentFixture } from "./payment-test-context";
import { FinancialMutationTestContext } from "./financial-mutation-test-context";
import type { TestRole } from "./shift-test-context";

export interface PaymentHttpResult {
  readonly body: Record<string, unknown> | undefined;
  readonly headers: Headers;
  readonly status: number;
}

export interface PaymentStaffCredentials {
  readonly email: string;
  readonly membershipId: string;
  readonly password: string;
  readonly userId: string;
}

interface RequestOptions {
  readonly authorization?: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

const allowedOrigin = "https://payments.valet.test";
const password = "exact payment api password";

export class PaymentApiTestContext extends FinancialMutationTestContext {
  private app!: INestApplication;
  private baseUrl = "";
  private passwordHash = "";
  private readonly previousEnvironment = new Map<string, string | undefined>();

  constructor(label: string) {
    super(`api_${label}`);
  }

  async setupApi(): Promise<void> {
    await this.setup();
    this.setEnvironment("DATABASE_URL", this.runtimeUrl);
    this.setEnvironment("STAFF_AUTH_ALLOWED_ORIGINS", allowedOrigin);
    this.setEnvironment(
      "ANTI_ABUSE_HMAC_SECRET_B64URL",
      randomBytes(32).toString("base64url"),
    );
    this.setEnvironment("ANTI_ABUSE_TRUSTED_PROXY_CIDRS", "");
    this.passwordHash = await argon2.hash(password, {
      hashLength: 32,
      memoryCost: 65_536,
      parallelism: 4,
      salt: randomBytes(16),
      timeCost: 3,
      type: argon2.argon2id,
      version: 19,
    });
    this.app = await NestFactory.create(AppModule, { logger: false });
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

  async createStaff(
    fixture: PaymentFixture,
    role: TestRole = "LOCATION_MANAGER",
  ): Promise<PaymentStaffCredentials> {
    const actor = await this.actor(fixture, role);
    const result = await this.adminPool.query<{ email: string }>(
      `UPDATE users SET password_hash = $2, updated_at = transaction_timestamp()
       WHERE id = $1 RETURNING email`,
      [actor.userId, this.passwordHash],
    );
    return {
      email: result.rows[0]!.email,
      membershipId: actor.membershipId,
      password,
      userId: actor.userId,
    };
  }

  login(credentials: PaymentStaffCredentials): Promise<PaymentHttpResult> {
    return this.request("POST", "/v1/staff/auth/login", {
      body: { email: credentials.email, password: credentials.password },
      headers: { Origin: allowedOrigin },
    });
  }

  request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<PaymentHttpResult> {
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
        headers: response.headers,
        status: response.status,
      };
    });
  }

  duplicateAuthorization(
    method: string,
    path: string,
    authorization: string,
    body: unknown,
  ): Promise<PaymentHttpResult> {
    const target = new URL(this.baseUrl);
    const encodedBody = JSON.stringify(body);
    return new Promise<PaymentHttpResult>((resolvePromise, reject) => {
      const request = httpRequest(
        {
          headers: [
            "Authorization",
            authorization,
            "Authorization",
            authorization,
            "Content-Type",
            "application/json",
            "Content-Length",
            String(Buffer.byteLength(encodedBody)),
            "Host",
            target.host,
            "X-Request-Id",
            randomUUID(),
          ],
          host: target.hostname,
          method,
          path,
          port: target.port,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            const headers = new Headers();
            for (const [name, value] of Object.entries(response.headers)) {
              if (value !== undefined) {
                headers.set(
                  name,
                  Array.isArray(value) ? value.join(", ") : value,
                );
              }
            }
            resolvePromise({
              body:
                text === ""
                  ? undefined
                  : (JSON.parse(text) as Record<string, unknown>),
              headers,
              status: response.statusCode ?? 0,
            });
          });
        },
      );
      request.on("error", reject);
      request.end(encodedBody);
    });
  }

  async clearAntiAbuse(): Promise<void> {
    await this.adminPool.query("DELETE FROM anti_abuse_events");
  }

  private setEnvironment(name: string, value: string): void {
    if (!this.previousEnvironment.has(name)) {
      this.previousEnvironment.set(name, process.env[name]);
    }
    process.env[name] = value;
  }
}
