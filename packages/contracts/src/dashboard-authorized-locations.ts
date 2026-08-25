import { z } from "zod";

/**
 * D2-005 — Public authorized-location enumeration for the Management
 * Dashboard.
 *
 * GET /v1/staff/dashboard/locations returns exactly the ACTIVE locations of
 * ACTIVE organizations where the authenticated actor holds an ACTIVE
 * LOCATION_MANAGER membership with an explicit membership_location_access row.
 * The response shape mirrors the backend's single authorization query
 * (`listAuthorizedDashboardLocations`) one-to-one:
 *
 * - locationId / organizationId: backend UUIDs (string form)
 * - name: location display name (never empty)
 * - currency: ISO-4217 alpha-3 as stored/enforced by the locations table
 * - timezone: IANA timezone string as stored on the locations table
 *
 * No additional metadata (address, brand, subscription, counters, status
 * badges, organization names) is part of this contract.
 */
export const dashboardAuthorizedLocationSchema = z
  .object({
    locationId: z.string().uuid(),
    name: z.string().min(1),
    organizationId: z.string().uuid(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    timezone: z.string().min(1),
  })
  .strict();

export const dashboardAuthorizedLocationsResponseSchema = z
  .object({
    /**
     * Deterministic backend order: location name ASC, then location id ASC.
     * An authenticated manager with zero authorized locations receives an
     * empty array — that is an authorization outcome, not a transport error.
     */
    locations: z.array(dashboardAuthorizedLocationSchema),
  })
  .strict();

export type DashboardAuthorizedLocation = z.infer<
  typeof dashboardAuthorizedLocationSchema
>;

export type DashboardAuthorizedLocationsResponse = z.infer<
  typeof dashboardAuthorizedLocationsResponseSchema
>;
