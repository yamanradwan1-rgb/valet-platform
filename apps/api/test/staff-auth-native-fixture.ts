import { randomBytes, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import argon2 from "argon2";
import { Pool, type QueryResult } from "pg";
import { AppModule } from "../src/app.module";
import { runPnpm } from "./staff-auth-native-run-pnpm";
export interface AuthHttpResult {
  readonly body: Record<string, unknown> | undefined;
  readonly headers: Headers;
  readonly status: number;
}
export interface AuthRawHttpResult {
  readonly bytes: Uint8Array;
  readonly headers: Headers;
  readonly status: number;
}
interface AuthRequestOptions {
  readonly authorization?: string;
  readonly body?: unknown;
  readonly contentType?: string;
  readonly cookie?: string;
  readonly method?: "GET" | "POST" | "PUT";
  readonly origin?: string;
}
const allowedOrigin = "https://staff.mob007.test";
const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${randomBytes(4).toString("hex")}`;
const databaseName = `valet_mob007_auth_${suffix}`;
const runtimeRole = `valet_runtime_mob007_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const mfaWriterRole = `valet_mfa_writer_mob007_${suffix}`;
const mfaWriterPassword = `mfa-writer-${randomUUID()}`;

function databaseUrl(name: string): string {
  const url = new URL(
    process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL ?? adminDatabaseUrl,
  );
  url.pathname = `/${name}`;
  return url.toString();
}

function runtimeUrl(name: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  url.username = runtimeRole;
  url.password = runtimePassword;
  return url.toString();
}

function mfaWriterUrl(name: string): string {
  const url = new URL(runtimeUrl(name));
  url.username = mfaWriterRole;
  url.password = mfaWriterPassword;
  return url.toString();
}

export class StaffAuthNativeFixture {
  readonly allowedOrigin = allowedOrigin;
  private adminPool: Pool | undefined;
  private app: INestApplication | undefined;
  private baseUrl = "";
  private databaseCreated = false;
  private roleCreated = false;
  private protectedMfaRoleCreated = false;
  private migrationUrl = "";
  private readonly optionalWriterPrevious = new Map<
    string,
    string | undefined
  >();
  private readonly originalEnvironment = {
    antiAbuse: process.env.ANTI_ABUSE_HMAC_SECRET_B64URL,
    database: process.env.DATABASE_URL,
    mfaProtected: process.env.MFA_PROTECTED_WRITER_ENABLED,
    mfaWriter: process.env.MFA_WRITER_DATABASE_URL,
    mfaActivity: process.env.MFA_ACTIVITY_PROOF_SECRET_B64URL,
    origins: process.env.STAFF_AUTH_ALLOWED_ORIGINS,
    proxies: process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS,
  };

  async start(): Promise<void> {
    const protectedMode = process.env.ISSUE416_S02_PROTECTED_TEST === "1";
    const activityRoot = randomBytes(32).toString("base64url");
    this.protectedMfaRoleCreated = protectedMode;
    const bootstrap = new Pool({ connectionString: adminDatabaseUrl });
    try {
      await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
      this.databaseCreated = true;
      await this.prepareMigrationDatabase(databaseName);
    } finally {
      await bootstrap.end();
    }
    this.migrationUrl = databaseUrl(databaseName);
    const applicationUrl = runtimeUrl(databaseName);
    await runPnpm(["--filter", "@valet/database", "migrate:deploy"], {
      MIGRATION_DATABASE_URL: this.migrationUrl,
      NODE_ENV: "test",
    });
    await this.prepareRuntimeProvisioning(applicationUrl);
    // The integrated Option C fixture must use the real S04 migration.
    // Do not silently install a synthetic SECURITY DEFINER function.
    const writers = {
      MFA_PROTECTED_WRITER_ENABLED: protectedMode ? "true" : "false",
      ...(protectedMode
        ? {
            MFA_WRITER_DATABASE_URL: mfaWriterUrl(databaseName),
            MFA_ACTIVITY_PROOF_SECRET_B64URL: activityRoot,
          }
        : {}),
      ...this.protectedWriterTestEnvironment(applicationUrl),
    };
    this.roleCreated = true;
    await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
      DATABASE_URL: applicationUrl,
      MIGRATION_DATABASE_URL: this.migrationUrl,
      ...writers,
      NODE_ENV: "test",
    });
    await this.afterRuntimeProvisioning(applicationUrl, writers);
    this.adminPool = new Pool({ connectionString: this.migrationUrl });
    for (const [key, value] of Object.entries(writers)) {
      this.optionalWriterPrevious.set(key, process.env[key]);
      process.env[key] = value;
    }
    process.env.DATABASE_URL = applicationUrl;
    process.env.MFA_PROTECTED_WRITER_ENABLED = protectedMode ? "true" : "false";
    if (protectedMode)
      process.env.MFA_WRITER_DATABASE_URL = mfaWriterUrl(databaseName);
    if (protectedMode)
      process.env.MFA_ACTIVITY_PROOF_SECRET_B64URL = activityRoot;
    process.env.STAFF_AUTH_ALLOWED_ORIGINS = allowedOrigin;
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "";
    this.app = await NestFactory.create(AppModule, { logger: false });
    await this.app.listen(0, "127.0.0.1");
    const address = this.app.getHttpServer().address() as { port: number };
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }
  protected protectedWriterTestEnvironment(
    applicationUrl: string,
  ): Record<string, string> {
    void applicationUrl;
    return {};
  }
  protected async prepareMigrationDatabase(_databaseName: string): Promise<void> {}
  protected async prepareRuntimeProvisioning(_applicationUrl: string): Promise<void> {}
  protected async afterRuntimeProvisioning(_applicationUrl: string, _writers: Record<string, string>): Promise<void> {}
  async resetLimits(): Promise<void> {
    await this.query("DELETE FROM anti_abuse_events");
  }

  async createUser(
    options: { status?: "ACTIVE" | "DISABLED" } = {},
  ): Promise<{ email: string; id: string; password: string }> {
    const id = randomUUID();
    const email = `${id}@example.com`;
    const password = "MOB-007 exact password";
    const passwordHash = await argon2.hash(password, {
      hashLength: 32,
      memoryCost: 65_536,
      parallelism: 4,
      salt: randomBytes(16),
      timeCost: 3,
      type: argon2.argon2id,
      version: 19,
    });
    await this.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, $3, $4, transaction_timestamp())`,
      [id, email, passwordHash, options.status ?? "ACTIVE"],
    );
    return { email, id, password };
  }

  query<T extends object>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (this.adminPool === undefined) throw new Error("Fixture not started.");
    return this.adminPool.query<T>(text, values);
  }

  databasePool(): Pool {
    if (this.adminPool === undefined) throw new Error("Fixture not started.");
    return this.adminPool;
  }

  migrationDatabaseUrl(): string {
    if (this.migrationUrl === "") throw new Error("Fixture not started.");
    return this.migrationUrl;
  }

  runtimeDatabaseUrl(): string {
    if (this.migrationUrl === "") throw new Error("Fixture not started.");
    return runtimeUrl(databaseName);
  }

  async request(
    path: string,
    options: AuthRequestOptions = {},
  ): Promise<AuthHttpResult> {
    const headers: Record<string, string> = {
      "Content-Type": options.contentType ?? "application/json",
      "X-Request-Id": randomUUID(),
    };
    if (options.origin !== undefined) headers.Origin = options.origin;
    if (options.cookie !== undefined) headers.Cookie = options.cookie;
    if (options.authorization !== undefined) {
      headers.Authorization = options.authorization;
    }
    const method = options.method ?? "POST";
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...(method === "GET" ? {} : { body: JSON.stringify(options.body ?? {}) }),
      headers,
      method,
    });
    const text = await response.text();
    return {
      body:
        text === "" ? undefined : (JSON.parse(text) as Record<string, unknown>),
      headers: response.headers,
      status: response.status,
    };
  }

  async requestBytes(
    path: string,
    options: AuthRequestOptions = {},
  ): Promise<AuthRawHttpResult> {
    const headers: Record<string, string> = {
      "Content-Type": options.contentType ?? "application/json",
      "X-Request-Id": randomUUID(),
    };
    if (options.origin !== undefined) headers.Origin = options.origin;
    if (options.cookie !== undefined) headers.Cookie = options.cookie;
    if (options.authorization !== undefined) {
      headers.Authorization = options.authorization;
    }
    const method = options.method ?? "POST";
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...(method === "GET" ? {} : { body: JSON.stringify(options.body ?? {}) }),
      headers,
      method,
    });
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      headers: response.headers,
      status: response.status,
    };
  }

  async stop(): Promise<void> {
    if (this.app !== undefined) await this.app.close();
    if (this.adminPool !== undefined) await this.adminPool.end();
    const bootstrap = new Pool({ connectionString: adminDatabaseUrl });
    try {
      if (this.databaseCreated) {
        await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      }
      if (this.roleCreated)
        await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
      if (this.protectedMfaRoleCreated) {
        await bootstrap.query(`DROP ROLE IF EXISTS "${mfaWriterRole}"`);
      }
    } finally {
      await bootstrap.end();
      this.restoreEnvironment();
    }
  }

  private restoreEnvironment(): void {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore(
      "ANTI_ABUSE_HMAC_SECRET_B64URL",
      this.originalEnvironment.antiAbuse,
    );
    restore("DATABASE_URL", this.originalEnvironment.database);
    restore(
      "MFA_PROTECTED_WRITER_ENABLED",
      this.originalEnvironment.mfaProtected,
    );
    restore("MFA_WRITER_DATABASE_URL", this.originalEnvironment.mfaWriter);
    restore(
      "MFA_ACTIVITY_PROOF_SECRET_B64URL",
      this.originalEnvironment.mfaActivity,
    );
    restore("STAFF_AUTH_ALLOWED_ORIGINS", this.originalEnvironment.origins);
    restore("ANTI_ABUSE_TRUSTED_PROXY_CIDRS", this.originalEnvironment.proxies);
    for (const [key, value] of this.optionalWriterPrevious) restore(key, value);
  }
}
