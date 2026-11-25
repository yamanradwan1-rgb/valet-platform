import { randomBytes, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Pool, type QueryResult } from "pg";
import { AppModule } from "../src/app.module";
import { runPnpm } from "./staff-auth-native-run-pnpm";
import {
  requestAuth,
  requestAuthBytes,
  type AuthRequestOptions,
} from "./staff-auth-native-http";
import {
  captureFixtureWriterRoleBaseline,
  captureFixtureWriterRolePostState,
  type FixtureWriterRoleSnapshot,
} from "./staff-auth-native-writer-role-lifecycle";
import {
  createFixtureStaffAuthWriterIdentity,
  ciFixtureManagementWriterEnvironment,
  provisionStaffAuthWriter,
  resolveAttestedFixtureWriterEnvironment,
  StaffAuthNativeProofKeys,
} from "./staff-auth-native-test-environment";
import { createStaffAuthNativeUser } from "./staff-auth-native-user";
import { cleanupStaffAuthNativeFixture } from "./staff-auth-native-fixture-cleanup";
import { fixtureSessionLockRoles } from "./staff-auth-native-session-lock-owner";
export type {
  AuthHttpResult,
  AuthRawHttpResult,
} from "./staff-auth-native-http";
const allowedOrigin = "https://staff.mob007.test";
const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
function databaseUrl(name: string): string {
  const url = new URL(
    process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL ?? adminDatabaseUrl,
  );
  url.pathname = `/${name}`;
  return url.toString();
}

function runtimeUrl(name: string, role: string, password: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  url.username = role;
  url.password = password;
  return url.toString();
}

export class StaffAuthNativeFixture {
  readonly allowedOrigin = allowedOrigin;
  private readonly suffix = `${process.pid}_${randomBytes(4).toString("hex")}`;
  private readonly databaseName = `valet_mob007_auth_${this.suffix}`;
  private readonly runtimeRole = `valet_runtime_mob007_${this.suffix}`;
  private readonly runtimePassword = `runtime-${randomUUID()}`;
  private readonly staffAuthWriterIdentity =
    createFixtureStaffAuthWriterIdentity(
      runtimeUrl(this.databaseName, this.runtimeRole, this.runtimePassword),
    );
  private readonly mfaWriterRole = `valet_mfa_writer_mob007_${this.suffix}`;
  private readonly mfaWriterPassword = `mfa-writer-${randomUUID()}`;
  private adminPool: Pool | undefined;
  private app: INestApplication | undefined;
  private baseUrl = "";
  private databaseCreated = false;
  private roleCreated = false;
  private writerRoleSnapshots: FixtureWriterRoleSnapshot[] = [];
  protected readonly proofKeys = new StaffAuthNativeProofKeys();
  private migrationUrl = "";
  private readonly optionalWriterPrevious = new Map<
    string,
    string | undefined
  >();
  private readonly originalEnvironment = {
    database: process.env.DATABASE_URL,
    migration: process.env.MIGRATION_DATABASE_URL,
    mfaProtected: process.env.MFA_PROTECTED_WRITER_ENABLED,
    mfaWriter: process.env.MFA_WRITER_DATABASE_URL,
    mfaActivity: process.env.MFA_ACTIVITY_PROOF_SECRET_B64URL,
    origins: process.env.STAFF_AUTH_ALLOWED_ORIGINS,
    proxies: process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS,
  };

  async start(): Promise<void> {
    const activityRoot = randomBytes(32).toString("base64url");
    const applicationUrl = runtimeUrl(
      this.databaseName,
      this.runtimeRole,
      this.runtimePassword,
    );
    const { protectedMode, writers } = resolveAttestedFixtureWriterEnvironment({
      activityRoot,
      adminDatabaseUrl,
      applicationUrl,
      databaseName: this.databaseName,
      explicitWriters: this.protectedWriterTestEnvironment(applicationUrl),
      mfaWriterPassword: this.mfaWriterPassword,
      mfaWriterRole: this.mfaWriterRole,
      migrationDatabaseUrl: databaseUrl(this.databaseName),
    });
    const bootstrap = new Pool({ connectionString: adminDatabaseUrl });
    try {
      this.writerRoleSnapshots = await captureFixtureWriterRoleBaseline(
        bootstrap,
        writers,
        await fixtureSessionLockRoles(bootstrap, adminDatabaseUrl),
      );
      await bootstrap.query(`CREATE DATABASE "${this.databaseName}"`);
      this.databaseCreated = true;
      await this.prepareMigrationDatabase(this.databaseName);
    } finally {
      await bootstrap.end();
    }
    this.migrationUrl = databaseUrl(this.databaseName);
    await runPnpm(["--filter", "@valet/database", "migrate:deploy"], {
      MIGRATION_DATABASE_URL: this.migrationUrl,
      NODE_ENV: "test",
    });
    this.roleCreated = true;
    await this.prepareRuntimeProvisioning(applicationUrl);
    await this.proofKeys.provision(runPnpm, this.migrationUrl, applicationUrl);
    // The integrated Option C fixture must use the real S04 migration.
    // Do not silently install a synthetic SECURITY DEFINER function.
    await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
      DATABASE_URL: applicationUrl,
      MIGRATION_DATABASE_URL: this.migrationUrl,
      ...this.proofKeys.environment(),
      ...writers,
      ...ciFixtureManagementWriterEnvironment(applicationUrl),
      NODE_ENV: "test",
    });
    await this.captureWriterRolePostState();
    await provisionStaffAuthWriter(
      runPnpm,
      this.migrationUrl,
      applicationUrl,
      writers,
    );
    await this.captureWriterRolePostState();
    await this.afterRuntimeProvisioning(applicationUrl, writers);
    this.adminPool = new Pool({ connectionString: this.migrationUrl });
    for (const [key, value] of Object.entries({
      ...ciFixtureManagementWriterEnvironment(applicationUrl),
      ...writers,
    })) {
      this.optionalWriterPrevious.set(key, process.env[key]);
      process.env[key] = value;
    }
    process.env.DATABASE_URL = applicationUrl;
    process.env.MIGRATION_DATABASE_URL = this.migrationUrl;
    this.proofKeys.apply();
    process.env.MFA_PROTECTED_WRITER_ENABLED = protectedMode ? "true" : "false";
    if (protectedMode)
      process.env.MFA_ACTIVITY_PROOF_SECRET_B64URL = activityRoot;
    process.env.STAFF_AUTH_ALLOWED_ORIGINS = allowedOrigin;
    process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "";
    this.app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    await this.app.listen(0, "127.0.0.1");
    const address = this.app.getHttpServer().address() as { port: number };
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }
  protected protectedWriterTestEnvironment(
    applicationUrl: string,
  ): Record<string, string> {
    void applicationUrl;
    return { STAFF_AUTH_WRITER_DATABASE_URL: this.staffAuthWriterIdentity.url };
  }
  protected async prepareMigrationDatabase(
    databaseName: string,
  ): Promise<void> {
    void databaseName;
  }
  protected async prepareRuntimeProvisioning(
    applicationUrl: string,
  ): Promise<void> {
    void applicationUrl;
  }
  protected async afterRuntimeProvisioning(
    applicationUrl: string,
    writers: Record<string, string>,
  ): Promise<void> {
    void applicationUrl;
    void writers;
  }
  async resetLimits(): Promise<void> {
    await this.query("DELETE FROM anti_abuse_events");
  }

  async createUser(
    options: { status?: "ACTIVE" | "DISABLED" } = {},
  ): Promise<{ email: string; id: string; password: string }> {
    return createStaffAuthNativeUser(this.databasePool(), options);
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
    return runtimeUrl(
      this.databaseName,
      this.runtimeRole,
      this.runtimePassword,
    );
  }

  request(path: string, options: AuthRequestOptions = {}) {
    return requestAuth(this.baseUrl, path, options);
  }

  requestBytes(path: string, options: AuthRequestOptions = {}) {
    return requestAuthBytes(this.baseUrl, path, options);
  }

  async stop(): Promise<void> {
    try {
      const databaseOwnerRole = this.cleanupDatabaseOwnerRole();
      await cleanupStaffAuthNativeFixture({
        app: this.app,
        pool: this.adminPool,
        adminDatabaseUrl,
        databaseCreated: this.databaseCreated,
        databaseName: this.databaseName,
        fixtureDatabaseUrl: runtimeUrl(
          this.databaseName,
          this.runtimeRole,
          this.runtimePassword,
        ),
        ...(databaseOwnerRole === undefined ? {} : { databaseOwnerRole }),
        ...(this.roleCreated ? { runtimeRole: this.runtimeRole } : {}),
        writerRoleSnapshots: this.writerRoleSnapshots,
      });
    } finally {
      this.restoreEnvironment();
    }
  }

  protected cleanupDatabaseOwnerRole(): string | undefined {
    return undefined;
  }

  private restoreEnvironment(): void {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    this.proofKeys.restore();
    restore("DATABASE_URL", this.originalEnvironment.database);
    restore("MIGRATION_DATABASE_URL", this.originalEnvironment.migration);
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

  private async captureWriterRolePostState(): Promise<void> {
    const bootstrap = new Pool({ connectionString: adminDatabaseUrl });
    try {
      this.writerRoleSnapshots = await captureFixtureWriterRolePostState(
        bootstrap,
        this.writerRoleSnapshots,
      );
    } finally {
      await bootstrap.end();
    }
  }
}
