CREATE TABLE "staff_auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "current_access_token_hash" TEXT NOT NULL,
    "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_rotated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_auth_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_auth_sessions_access_hash_check" CHECK (
        "current_access_token_hash" ~ '^staff-access-sha256:v1:[0-9a-f]{64}$'
    ),
    CONSTRAINT "staff_auth_sessions_expiry_check" CHECK (
        "access_expires_at" > "created_at"
        AND "access_expires_at" <= "absolute_expires_at"
        AND "last_rotated_at" >= "created_at"
        AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
        AND "absolute_expires_at" > "created_at"
    )
);

CREATE TABLE "staff_refresh_credentials" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "replaced_by_credential_id" UUID,

    CONSTRAINT "staff_refresh_credentials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_refresh_credentials_token_hash_check" CHECK (
        "token_hash" ~ '^staff-refresh-sha256:v1:[0-9a-f]{64}$'
    ),
    CONSTRAINT "staff_refresh_credentials_generation_check" CHECK ("generation" > 0),
    CONSTRAINT "staff_refresh_credentials_expiry_check" CHECK (
        "expires_at" > "created_at"
        AND (
            "consumed_at" IS NULL
            OR (
                "consumed_at" >= "created_at"
                AND "consumed_at" <= "expires_at"
            )
        )
    ),
    CONSTRAINT "staff_refresh_credentials_replacement_check" CHECK (
        "replaced_by_credential_id" IS NULL OR "replaced_by_credential_id" <> "id"
    )
);

CREATE UNIQUE INDEX "staff_auth_sessions_current_access_token_hash_key"
ON "staff_auth_sessions"("current_access_token_hash");

CREATE INDEX "staff_auth_sessions_user_id_status_idx"
ON "staff_auth_sessions"("user_id", "revoked_at", "absolute_expires_at");

CREATE UNIQUE INDEX "staff_refresh_credentials_token_hash_key"
ON "staff_refresh_credentials"("token_hash");

CREATE UNIQUE INDEX "staff_refresh_credentials_session_id_generation_key"
ON "staff_refresh_credentials"("session_id", "generation");

CREATE UNIQUE INDEX "staff_refresh_credentials_session_id_id_key"
ON "staff_refresh_credentials"("session_id", "id");

CREATE UNIQUE INDEX "staff_refresh_credentials_one_current_per_session_key"
ON "staff_refresh_credentials"("session_id")
WHERE "consumed_at" IS NULL;

ALTER TABLE "staff_auth_sessions"
ADD CONSTRAINT "staff_auth_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "staff_refresh_credentials"
ADD CONSTRAINT "staff_refresh_credentials_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "staff_auth_sessions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "staff_refresh_credentials"
ADD CONSTRAINT "staff_refresh_credentials_replacement_fkey"
FOREIGN KEY ("session_id", "replaced_by_credential_id")
REFERENCES "staff_refresh_credentials"("session_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
