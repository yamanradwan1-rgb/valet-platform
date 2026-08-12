-- CreateEnum
CREATE TYPE "task_type" AS ENUM ('PARKING', 'RETRIEVAL');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM (
    'QUEUED',
    'ASSIGNED',
    'ACCEPTED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

-- CreateEnum
CREATE TYPE "dispatch_event_type" AS ENUM (
    'QUEUED',
    'ASSIGNED',
    'ACCEPTED',
    'DECLINED',
    'REASSIGNED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "task_type" "task_type" NOT NULL,
    "status" "task_status" NOT NULL DEFAULT 'QUEUED',
    "current_assignee_membership_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tasks_assignee_status_check" CHECK (
        ("status" = 'QUEUED' AND "current_assignee_membership_id" IS NULL)
        OR ("status" IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
            AND "current_assignee_membership_id" IS NOT NULL)
        OR "status" IN ('COMPLETED', 'CANCELLED')
    )
);

-- CreateTable
CREATE TABLE "dispatch_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "event_type" "dispatch_event_type" NOT NULL,
    "actor_membership_id" UUID,
    "previous_assignee_membership_id" UUID,
    "new_assignee_membership_id" UUID,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dispatch_events_assignee_shape_check" CHECK (
        ("event_type" = 'QUEUED'
            AND "previous_assignee_membership_id" IS NULL
            AND "new_assignee_membership_id" IS NULL)
        OR ("event_type" IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED')
            AND "new_assignee_membership_id" IS NOT NULL)
        OR ("event_type" = 'DECLINED'
            AND "previous_assignee_membership_id" IS NOT NULL)
        OR ("event_type" = 'REASSIGNED'
            AND "previous_assignee_membership_id" IS NOT NULL
            AND "new_assignee_membership_id" IS NOT NULL
            AND "previous_assignee_membership_id" <> "new_assignee_membership_id")
        OR "event_type" = 'CANCELLED'
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "tasks_organization_id_location_id_valet_session_id_id_key"
ON "tasks"("organization_id", "location_id", "valet_session_id", "id");

CREATE UNIQUE INDEX "tasks_one_active_per_valet_session_task_type_idx"
ON "tasks"("valet_session_id", "task_type")
WHERE "status" IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS');

CREATE INDEX "tasks_location_id_status_created_at_id_idx"
ON "tasks"("location_id", "status", "created_at", "id");

CREATE INDEX "tasks_current_assignee_membership_id_status_idx"
ON "tasks"("current_assignee_membership_id", "status");

CREATE INDEX "tasks_valet_session_id_created_at_id_idx"
ON "tasks"("valet_session_id", "created_at", "id");

CREATE INDEX "dispatch_events_task_id_occurred_at_id_idx"
ON "dispatch_events"("task_id", "occurred_at", "id");

CREATE INDEX "dispatch_events_valet_session_id_occurred_at_id_idx"
ON "dispatch_events"("valet_session_id", "occurred_at", "id");

-- AddForeignKey
ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_org_location_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_org_current_assignee_membership_id_fkey"
FOREIGN KEY ("organization_id", "current_assignee_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "dispatch_events"
ADD CONSTRAINT "dispatch_events_task_scope_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id", "task_id")
REFERENCES "tasks"("organization_id", "location_id", "valet_session_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "dispatch_events"
ADD CONSTRAINT "dispatch_events_org_actor_membership_id_fkey"
FOREIGN KEY ("organization_id", "actor_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "dispatch_events"
ADD CONSTRAINT "dispatch_events_org_previous_assignee_membership_id_fkey"
FOREIGN KEY ("organization_id", "previous_assignee_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "dispatch_events"
ADD CONSTRAINT "dispatch_events_org_new_assignee_membership_id_fkey"
FOREIGN KEY ("organization_id", "new_assignee_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
