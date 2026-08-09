-- CreateEnum
CREATE TYPE "condition_evidence_context" AS ENUM ('CHECK_IN');

-- CreateEnum
CREATE TYPE "vehicle_photo_purpose" AS ENUM ('CHECK_IN_CONDITION');

-- AlterTable
ALTER TABLE "organizations"
ADD COLUMN "check_in_photos_required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "locations"
ADD COLUMN "check_in_photos_required_override" BOOLEAN;

-- AlterTable
ALTER TABLE "valet_sessions"
ADD COLUMN "check_in_condition_completed_at" TIMESTAMPTZ(3),
ADD COLUMN "check_in_condition_completed_by_membership_id" UUID,
ADD CONSTRAINT "valet_sessions_check_in_condition_completion_pair_check"
CHECK (
    (
        "check_in_condition_completed_at" IS NULL
        AND "check_in_condition_completed_by_membership_id" IS NULL
    )
    OR (
        "check_in_condition_completed_at" IS NOT NULL
        AND "check_in_condition_completed_by_membership_id" IS NOT NULL
    )
);

-- CreateTable
CREATE TABLE "condition_notes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "context" "condition_evidence_context" NOT NULL,
    "content" TEXT NOT NULL,
    "supersedes_condition_note_id" UUID,
    "recorded_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "condition_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "condition_notes_content_check" CHECK (btrim("content") <> ''),
    CONSTRAINT "condition_notes_not_self_supersession_check" CHECK (
        "supersedes_condition_note_id" IS NULL
        OR "supersedes_condition_note_id" <> "id"
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "condition_notes_scope_context_id_key"
ON "condition_notes"(
    "organization_id",
    "location_id",
    "valet_session_id",
    "context",
    "id"
);

CREATE INDEX "condition_notes_valet_session_id_created_at_idx"
ON "condition_notes"("valet_session_id", "created_at");

-- CreateTable
CREATE TABLE "vehicle_photos" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "captured_by_membership_id" UUID NOT NULL,
    "purpose" "vehicle_photo_purpose" NOT NULL,
    "storage_object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_photos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vehicle_photos_storage_object_key_check" CHECK (
        btrim("storage_object_key") <> ''
    ),
    CONSTRAINT "vehicle_photos_content_type_check" CHECK (
        btrim("content_type") <> ''
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_photos_storage_object_key_key"
ON "vehicle_photos"("storage_object_key");

CREATE INDEX "vehicle_photos_valet_session_id_purpose_created_at_idx"
ON "vehicle_photos"("valet_session_id", "purpose", "created_at");

-- AddForeignKey
ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_condition_completed_by_id_fkey"
FOREIGN KEY (
    "organization_id",
    "check_in_condition_completed_by_membership_id"
)
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "condition_notes"
ADD CONSTRAINT "condition_notes_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "condition_notes"
ADD CONSTRAINT "condition_notes_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "condition_notes"
ADD CONSTRAINT "condition_notes_org_location_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "condition_notes"
ADD CONSTRAINT "condition_notes_org_recorded_by_membership_id_fkey"
FOREIGN KEY ("organization_id", "recorded_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "condition_notes"
ADD CONSTRAINT "condition_notes_scope_supersedes_id_fkey"
FOREIGN KEY (
    "organization_id",
    "location_id",
    "valet_session_id",
    "context",
    "supersedes_condition_note_id"
)
REFERENCES "condition_notes"(
    "organization_id",
    "location_id",
    "valet_session_id",
    "context",
    "id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "vehicle_photos"
ADD CONSTRAINT "vehicle_photos_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "vehicle_photos"
ADD CONSTRAINT "vehicle_photos_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "vehicle_photos"
ADD CONSTRAINT "vehicle_photos_org_location_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "vehicle_photos"
ADD CONSTRAINT "vehicle_photos_org_captured_by_membership_id_fkey"
FOREIGN KEY ("organization_id", "captured_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
