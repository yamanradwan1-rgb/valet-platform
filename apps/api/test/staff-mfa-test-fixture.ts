import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { StaffAuthNativeFixture } from "./staff-auth-native-fixture";

export interface CompanyAdminFixture {
  readonly email: string;
  readonly organizationId: string;
  readonly password: string;
  readonly userId: string;
}

export interface MfaAuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly sessionId: string;
}

export interface MfaSessionSnapshot {
  readonly absolute_expires_at: Date;
  readonly last_admin_activity_at: Date | null;
  readonly mfa_authenticated_at: Date | null;
  readonly mfa_factor_id: string | null;
  readonly revoked_at: Date | null;
}

export class StaffMfaTestFixture extends StaffAuthNativeFixture {
  private readonly originalMfaEnvironment = {
    recovery: process.env.MFA_RECOVERY_HMAC_SECRET_B64URL,
    totp: process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL,
  };

  override async start(): Promise<void> {
    process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL =
      randomBytes(32).toString("base64url");
    process.env.MFA_RECOVERY_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    try {
      await super.start();
    } catch (error) {
      this.restoreMfaEnvironment();
      throw error;
    }
  }

  override async stop(): Promise<void> {
    try {
      await super.stop();
    } finally {
      this.restoreMfaEnvironment();
    }
  }

  async createCompanyAdmin(): Promise<CompanyAdminFixture> {
    const user = await this.createUser();
    const organizationId = randomUUID();
    await this.query(
      `INSERT INTO organizations
         (id, name, status, timezone, updated_at)
       VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', transaction_timestamp())`,
      [organizationId, `MFA test ${organizationId}`],
    );
    await this.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, 'ORG_ADMIN', 'ACTIVE', transaction_timestamp())`,
      [randomUUID(), organizationId, user.id],
    );
    return {
      email: user.email,
      organizationId,
      password: user.password,
      userId: user.id,
    };
  }

  async nativeLogin(
    user: Pick<CompanyAdminFixture, "email" | "password">,
  ): Promise<MfaAuthSession> {
    const result = await this.request("/v1/staff/auth/native/login", {
      body: { email: user.email, password: user.password },
    });
    if (result.status !== 200) {
      throw new Error(`MFA fixture login failed with ${result.status}.`);
    }
    const accessToken = String(result.body?.accessToken);
    const refreshToken = String(result.body?.refreshToken);
    const accessHash = `staff-access-sha256:v1:${createHash("sha256")
      .update(accessToken)
      .digest("hex")}`;
    const session = await this.query<{ id: string }>(
      `SELECT id::text FROM staff_auth_sessions
       WHERE current_access_token_hash = $1`,
      [accessHash],
    );
    const sessionId = session.rows[0]?.id;
    if (sessionId === undefined)
      throw new Error("MFA fixture session missing.");
    return { accessToken, refreshToken, sessionId };
  }

  postMfa(path: string, accessToken: string, body: unknown = {}) {
    return this.request(path, {
      authorization: `Bearer ${accessToken}`,
      body,
    });
  }

  getMfa(path: string, accessToken: string) {
    return this.request(path, {
      authorization: `Bearer ${accessToken}`,
      method: "GET",
    });
  }

  refresh(refreshToken: string) {
    return this.request("/v1/staff/auth/native/refresh", {
      body: { refreshToken },
    });
  }

  logout(refreshToken: string) {
    return this.request("/v1/staff/auth/native/logout", {
      body: { refreshToken },
    });
  }

  sessionSnapshot(sessionId: string) {
    return this.query<MfaSessionSnapshot>(
      `SELECT mfa_authenticated_at, mfa_factor_id, last_admin_activity_at,
              absolute_expires_at, revoked_at
       FROM staff_auth_sessions WHERE id = $1`,
      [sessionId],
    );
  }

  factors(userId: string) {
    return this.query<{
      activated_at: Date | null;
      id: string;
      last_accepted_step: string | null;
      recovery_set_generation: number;
      state: string;
    }>(
      `SELECT id::text, state::text, last_accepted_step::text,
              recovery_set_generation, activated_at
       FROM user_mfa_totp_factors
       WHERE user_id = $1 ORDER BY created_at, id`,
      [userId],
    );
  }

  recoveryCodes(factorId: string) {
    return this.query<{
      consumed_at: Date | null;
      id: string;
      set_generation: number;
      slot: number;
    }>(
      `SELECT id::text, set_generation, slot, consumed_at
       FROM mfa_recovery_codes
       WHERE factor_id = $1 ORDER BY set_generation, slot`,
      [factorId],
    );
  }

  async lockSession(sessionId: string): Promise<PoolClient> {
    const client = await this.databasePool().connect();
    await client.query("BEGIN");
    await client.query(
      `SELECT id FROM staff_auth_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    return client;
  }

  private restoreMfaEnvironment(): void {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("MFA_TOTP_ENCRYPTION_KEY_B64URL", this.originalMfaEnvironment.totp);
    restore(
      "MFA_RECOVERY_HMAC_SECRET_B64URL",
      this.originalMfaEnvironment.recovery,
    );
  }
}
