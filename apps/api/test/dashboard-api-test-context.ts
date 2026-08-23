import { randomBytes, randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import argon2 from "argon2";

import { AppModule } from "../src/app.module";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";
import type { ShiftFixture } from "./shift-test-context";
import type { TestRole } from "./shift-test-context";
import {
  type DashboardActor,
} from "./dashboard-test-context";

export interface DashboardHttpResult {
  readonly body: Record<string, unknown> | undefined;
  readonly headers: Headers;
  readonly status: number;
}

export interface DashboardStaffCredentials {
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

const allowedOrigin = "https://dashboard.valet.test";
const password = "exact dashboard api password";

export class DashboardApiTestContext extends DashboardOverviewTestContext {
  private app!: INestApplication;
  protected baseUrl = "";
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
    fixture: ShiftFixture,
    role: TestRole = "LOCATION_MANAGER",
  ): Promise<DashboardStaffCredentials> {
    const actor: DashboardActor = await this.createActor(fixture, role);
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

  async authenticated(
    fixture: ShiftFixture,
    role: TestRole = "LOCATION_MANAGER",
  ): Promise<{ authorization: string; login: DashboardHttpResult }> {
    const login = await this.login(await this.createStaff(fixture, role));
    return {
      authorization: `Bearer ${String(login.body?.accessToken)}`,
      login,
    };
  }

  login(credentials: DashboardStaffCredentials): Promise<DashboardHttpResult> {
    return this.request("POST", "/v1/staff/auth/login", {
      body: { email: credentials.email, password: credentials.password },
      headers: { Origin: allowedOrigin },
    });
  }

  request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<DashboardHttpResult> {
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

  async clearAntiAbuse(): Promise<void> {
    await this.adminPool.query("DELETE FROM anti_abuse_events");
  }

  configurationPath(locationId: string, suffix = ""): string {
    return `/v1/staff/dashboard/locations/${locationId}/configuration${suffix}`;
  }

  private setEnvironment(name: string, value: string): void {
    if (!this.previousEnvironment.has(name)) {
      this.previousEnvironment.set(name, process.env[name]);
    }
    process.env[name] = value;
  }
}
