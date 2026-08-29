import type { PostgresPool } from "../../common/database/postgres";
import { authorizeCheckInLocation } from "../check-in-api/check-in-location-authorization";
import {
  normalizeVehicleIdentityInput,
  type ConfirmedPlateIdentityInput,
} from "./vehicle-identity-command";

interface VehicleRow {
  color: string | null;
  id: string;
  make: string | null;
  model: string | null;
  plate_country: string;
  plate_number_normalized: string;
  plate_number_raw: string;
  updated_at: Date;
}

interface CustomerRow {
  customer_id: string;
  display_name: string | null;
  phone_normalized: string;
}

export interface ReturningVehicleRecognitionRequest {
  readonly authenticatedUserId: string;
  readonly targetLocationId: string;
  readonly vehicleIdentity: ConfirmedPlateIdentityInput;
}

export interface ReturningVehicleRecognitionResult {
  readonly vehicle: null | {
    readonly color: string | null;
    readonly make: string | null;
    readonly model: string | null;
    readonly plateCountry: string;
    readonly plateNumberNormalized: string;
    readonly plateNumberRaw: string;
    readonly returningCustomer: null | {
      readonly customerId: string;
      readonly displayName: string | null;
      readonly phoneSuffix: string;
    };
    readonly vehicleId: string;
    readonly vehicleUpdatedAt: Date;
  };
}

export function maskCustomerPhoneSuffix(phoneNormalized: string): string {
  const digits = phoneNormalized.replace(/\D/gu, "");
  return digits.slice(-Math.min(4, digits.length));
}

export function createReturningVehicleRecognitionQuery(pool: PostgresPool) {
  return async (
    request: ReturningVehicleRecognitionRequest,
  ): Promise<ReturningVehicleRecognitionResult> => {
    const identity = normalizeVehicleIdentityInput(request.vehicleIdentity);
    if (identity.mode !== "CONFIRMED_PLATE") {
      throw new Error("Recognition requires a confirmed plate.");
    }
    const transaction = await pool.connect();
    try {
      await transaction.query("BEGIN");
      const scope = await authorizeCheckInLocation(
        transaction,
        request.authenticatedUserId,
        request.targetLocationId,
      );
      const vehicleResult = await transaction.query<VehicleRow>(
        `SELECT id::text, plate_country, plate_number_raw,
                plate_number_normalized, make, model, color, updated_at
         FROM vehicles
         WHERE organization_id = $1
           AND plate_country = $2
           AND plate_number_normalized = $3`,
        [
          scope.organizationId,
          identity.plateCountry,
          identity.plateNumberNormalized,
        ],
      );
      const vehicle = vehicleResult.rows[0];
      if (vehicle === undefined) {
        await transaction.query("COMMIT");
        return { vehicle: null };
      }

      const customers = await transaction.query<CustomerRow>(
        `SELECT candidate.customer_id::text, customer.display_name,
                customer.phone_normalized
         FROM (
           SELECT DISTINCT session.customer_id
           FROM valet_sessions AS session
           WHERE session.organization_id = $1
             AND session.vehicle_id = $2
             AND session.customer_id IS NOT NULL
             AND session.state = 'COMPLETED'
           LIMIT 2
         ) AS candidate
         INNER JOIN customers AS customer
           ON customer.organization_id = $1
          AND customer.id = candidate.customer_id`,
        [scope.organizationId, vehicle.id],
      );
      const customer =
        customers.rows.length === 1 ? customers.rows[0] : undefined;
      await transaction.query("COMMIT");
      return {
        vehicle: {
          color: vehicle.color,
          make: vehicle.make,
          model: vehicle.model,
          plateCountry: vehicle.plate_country,
          plateNumberNormalized: vehicle.plate_number_normalized,
          plateNumberRaw: vehicle.plate_number_raw,
          returningCustomer:
            customer === undefined
              ? null
              : {
                  customerId: customer.customer_id,
                  displayName: customer.display_name,
                  phoneSuffix: maskCustomerPhoneSuffix(
                    customer.phone_normalized,
                  ),
                },
          vehicleId: vehicle.id,
          vehicleUpdatedAt: vehicle.updated_at,
        },
      };
    } catch (error) {
      try {
        await transaction.query("ROLLBACK");
      } catch {
        // Preserve the recognition failure.
      }
      throw error;
    } finally {
      transaction.release();
    }
  };
}
