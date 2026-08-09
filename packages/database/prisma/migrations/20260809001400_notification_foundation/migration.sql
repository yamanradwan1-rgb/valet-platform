-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM (
    'SMS',
    'WHATSAPP',
    'EMAIL'
);

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM (
    'PENDING',
    'SENT',
    'FAILED'
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "valet_session_id" UUID,
    "channel" "notification_channel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "provider_reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_sent_at_check" CHECK (
        "status" <> 'SENT'
        OR "sent_at" IS NOT NULL
    ),
    CONSTRAINT "notifications_failed_at_check" CHECK (
        "status" <> 'FAILED'
        OR "failed_at" IS NOT NULL
    )
);

-- AddForeignKey
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_org_valet_session_id_fkey"
FOREIGN KEY ("organization_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
