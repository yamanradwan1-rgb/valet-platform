import type { PostgresTransaction } from "../../common/database/postgres";
import type { NormalizedVehicleIdentity } from "../vehicles/vehicle-identity-command";
import type { NormalizedVehicleDetails } from "../vehicles/vehicle-details-normalization";

export interface IntakeVehicleRow {
  readonly color: string | null;
  readonly id: string;
  readonly make: string | null;
  readonly model: string | null;
  readonly plate_country: string | null;
  readonly plate_number_normalized: string | null;
  readonly plate_number_raw: string | null;
  readonly temporary_descriptor: string | null;
  readonly updated_at: Date;
}

const projection = `id::text, plate_country, plate_number_raw,
  plate_number_normalized, temporary_descriptor, make, model, color,
  updated_at`;

export async function createOrResolveIntakeVehicle(
  transaction: PostgresTransaction,
  input: {
    readonly details: NormalizedVehicleDetails;
    readonly identity: NormalizedVehicleIdentity;
    readonly operationTime: Date;
    readonly organizationId: string;
    readonly vehicleId: string;
  },
): Promise<IntakeVehicleRow> {
  const detailValues = [
    input.details.make,
    input.details.model,
    input.details.color,
  ];
  if (input.identity.mode === "TEMPORARY_DESCRIPTOR") {
    const result = await transaction.query<IntakeVehicleRow>(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, make, model, color,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING ${projection}`,
      [
        input.vehicleId,
        input.organizationId,
        input.identity.temporaryDescriptor,
        ...detailValues,
        input.operationTime,
      ],
    );
    return result.rows[0]!;
  }

  const inserted = await transaction.query<IntakeVehicleRow>(
    `INSERT INTO vehicles
       (id, organization_id, plate_country, plate_number_raw,
        plate_number_normalized, make, model, color, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     ON CONFLICT (organization_id, plate_country, plate_number_normalized)
       WHERE plate_number_normalized IS NOT NULL
     DO NOTHING
     RETURNING ${projection}`,
    [
      input.vehicleId,
      input.organizationId,
      input.identity.plateCountry,
      input.identity.plateNumberRaw,
      input.identity.plateNumberNormalized,
      ...detailValues,
      input.operationTime,
    ],
  );
  if (inserted.rows[0] !== undefined) return inserted.rows[0];

  const existing = await transaction.query<IntakeVehicleRow>(
    `SELECT ${projection}
     FROM vehicles
     WHERE organization_id = $1
       AND plate_country = $2
       AND plate_number_normalized = $3
     FOR UPDATE`,
    [
      input.organizationId,
      input.identity.plateCountry,
      input.identity.plateNumberNormalized,
    ],
  );
  const vehicle = existing.rows[0];
  if (vehicle === undefined) {
    throw new Error("Known vehicle identity could not be resolved.");
  }
  return vehicle;
}
