-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plate_country" TEXT,
    "plate_number_raw" TEXT,
    "plate_number_normalized" TEXT,
    "temporary_descriptor" TEXT,
    "make" TEXT,
    "model" TEXT,
    "color" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vehicles_plate_identity_all_or_none_check" CHECK (
        (
            "plate_country" IS NULL
            AND "plate_number_raw" IS NULL
            AND "plate_number_normalized" IS NULL
        )
        OR
        (
            "plate_country" IS NOT NULL
            AND "plate_number_raw" IS NOT NULL
            AND "plate_number_normalized" IS NOT NULL
        )
    ),
    CONSTRAINT "vehicles_plate_country_format_check" CHECK (
        "plate_country" IS NULL OR "plate_country" ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT "vehicles_temporary_descriptor_check" CHECK (
        (
            "temporary_descriptor" IS NULL
            OR (
                "temporary_descriptor" = btrim("temporary_descriptor")
                AND "temporary_descriptor" <> ''
            )
        )
        AND (
            "plate_country" IS NOT NULL
            OR "temporary_descriptor" IS NOT NULL
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_known_plate_unique_idx"
ON "vehicles"("organization_id", "plate_country", "plate_number_normalized")
WHERE "plate_number_normalized" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "customers"
ADD CONSTRAINT "customers_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles"
ADD CONSTRAINT "vehicles_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
