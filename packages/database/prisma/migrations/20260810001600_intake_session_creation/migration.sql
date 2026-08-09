-- CreateTable
CREATE TABLE "intake_operations" (
    "organization_id" UUID NOT NULL,
    "operation_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_operations_pkey"
        PRIMARY KEY ("organization_id", "operation_key"),
    CONSTRAINT "intake_operations_operation_key_check"
        CHECK ("operation_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
    CONSTRAINT "intake_operations_request_fingerprint_check"
        CHECK ("request_fingerprint" ~ '^[a-f0-9]{64}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "intake_operations_valet_session_id_key"
ON "intake_operations"("valet_session_id");

-- AddForeignKey
ALTER TABLE "intake_operations"
ADD CONSTRAINT "intake_operations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "intake_operations"
ADD CONSTRAINT "intake_operations_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "intake_operations"
ADD CONSTRAINT "intake_operations_org_location_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
