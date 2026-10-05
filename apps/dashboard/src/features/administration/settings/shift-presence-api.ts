import {
  requirePresencePolicy,
  requirePresenceZone,
  requirePresenceException,
  requirePresenceResult,
} from "./shift-presence-response-scope";
import {
  shiftPresenceCompanyResponseSchema,
  shiftPresenceCompanySetRequestSchema,
  shiftPresenceLocationResponseSchema,
  shiftPresenceLocationSetRequestSchema,
  shiftPresenceLocationClearRequestSchema,
  shiftPresenceZoneResponseSchema,
  shiftPresenceZoneListResponseSchema,
  shiftPresenceZoneCreateRequestSchema,
  shiftPresenceZoneUpdateRequestSchema,
  shiftPresenceManagementExceptionSchema,
  shiftPresenceExceptionListResponseSchema,
  shiftPresenceExceptionReviewRequestSchema,
  shiftPresenceManagementResultSchema,
  shiftPresenceManagementResultQuerySchema,
  type ShiftPresenceManagementResultQuery,
} from "@valet/contracts";
import type {
  DashboardApiClient,
  DashboardApiRequestOptions,
  RuntimeSchema,
} from "../../../lib/api/dashboard-api-client";
import {
  DashboardApiError,
  dashboardAuthBoundaryError,
} from "../../../lib/api/dashboard-api-error";

function parseWrite<T>(schema: RuntimeSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new DashboardApiError({
      kind: "validation",
      message: "Invalid presence mutation input.",
    });
  return result.data;
}

export type PresenceCompany = ReturnType<
  typeof shiftPresenceCompanyResponseSchema.parse
>;
export type PresenceLocation = ReturnType<
  typeof shiftPresenceLocationResponseSchema.parse
>;
export type PresenceException = ReturnType<
  typeof shiftPresenceManagementExceptionSchema.parse
>;
export type PresenceResult = ReturnType<
  typeof shiftPresenceManagementResultSchema.parse
>;
export type PresenceCanonical = PresenceResult["canonical"];
export type PresenceTarget = {
  readonly authority: "COMPANY_ADMIN" | "LOCATION_MANAGER";
  readonly organizationId: string;
  readonly locationId: string | null;
};

export function presenceBase(target: PresenceTarget) {
  if (target.authority === "LOCATION_MANAGER") {
    if (!target.locationId) throw new Error("Exact Location required.");
    return `/v1/staff/dashboard/locations/${target.locationId}/configuration/shift-presence`;
  }
  const company = `/v1/staff/management/organizations/${target.organizationId}/shift-presence`;
  return target.locationId
    ? `${company}/locations/${target.locationId}`
    : company;
}

/** Distinct authority routes; every payload and response uses GPS-B schemas. */
export class PresenceApi {
  readonly base: string;
  constructor(
    private readonly api: DashboardApiClient,
    readonly target: PresenceTarget,
    private options: () => DashboardApiRequestOptions = () => {
      throw dashboardAuthBoundaryError();
    },
  ) {
    this.base = presenceBase(target);
  }
  bindRequests(options: () => DashboardApiRequestOptions) {
    this.options = options;
  }
  async policy(
    signal?: AbortSignal,
  ): Promise<PresenceCompany | PresenceLocation> {
    const options = { ...this.options(), ...(signal ? { signal } : {}) };
    const value = this.target.locationId
      ? await this.api.request(
          `${this.base}/policy`,
          shiftPresenceLocationResponseSchema,
          options,
        )
      : await this.api.request(
          `${this.base}/policy`,
          shiftPresenceCompanyResponseSchema,
          options,
        );
    return requirePresencePolicy(this.target, value);
  }
  setPolicy(input: unknown) {
    const location = this.target.locationId !== null;
    if (location) {
      return this.api
        .request(
          `${this.base}/policy/override`,
          shiftPresenceLocationResponseSchema,
          {
            ...this.options(),
            method: "PUT",
            body: parseWrite(shiftPresenceLocationSetRequestSchema, input),
          },
        )
        .then((value) => requirePresencePolicy(this.target, value));
    }
    return this.api
      .request(
        `${this.base}/policy/default`,
        shiftPresenceCompanyResponseSchema,
        {
          ...this.options(),
          method: "PUT",
          body: parseWrite(shiftPresenceCompanySetRequestSchema, input),
        },
      )
      .then((value) => requirePresencePolicy(this.target, value));
  }
  clearPolicy(input: unknown) {
    return this.api
      .request(
        `${this.base}/policy/override/clear`,
        shiftPresenceLocationResponseSchema,
        {
          ...this.options(),
          method: "POST",
          body: parseWrite(shiftPresenceLocationClearRequestSchema, input),
        },
      )
      .then((value) => requirePresencePolicy(this.target, value));
  }
  zones(cursor?: string, signal?: AbortSignal) {
    return this.api
      .request(`${this.base}/zones`, shiftPresenceZoneListResponseSchema, {
        ...this.options(),
        ...(signal ? { signal } : {}),
        query: { cursor, limit: 25 },
      })
      .then((value) => {
        value.items.forEach((zone) => requirePresenceZone(this.target, zone));
        return value;
      });
  }
  zone(id: string, signal?: AbortSignal) {
    return this.api
      .request(`${this.base}/zones/${id}`, shiftPresenceZoneResponseSchema, {
        ...this.options(),
        ...(signal ? { signal } : {}),
      })
      .then((value) => {
        requirePresenceZone(this.target, value.zone, id);
        return value;
      });
  }
  saveZone(id: string, input: unknown, create: boolean) {
    return this.api
      .request(
        `${this.base}/zones${create ? "" : `/${id}`}`,
        shiftPresenceZoneResponseSchema,
        {
          ...this.options(),
          method: create ? "POST" : "PUT",
          body: create
            ? parseWrite(shiftPresenceZoneCreateRequestSchema, input)
            : parseWrite(shiftPresenceZoneUpdateRequestSchema, input),
        },
      )
      .then((value) => {
        requirePresenceZone(this.target, value.zone, id);
        return value;
      });
  }
  exceptions(
    view: "PENDING" | "HISTORY",
    cursor?: string,
    signal?: AbortSignal,
  ) {
    return this.api
      .request(
        `${this.base}/exceptions`,
        shiftPresenceExceptionListResponseSchema,
        {
          ...this.options(),
          ...(signal ? { signal } : {}),
          query: { view, cursor, limit: 25 },
        },
      )
      .then((value) => {
        value.items.forEach((entry) =>
          requirePresenceException(this.target, entry),
        );
        return value;
      });
  }
  exception(id: string, signal?: AbortSignal) {
    return this.api
      .request(
        `${this.base}/exceptions/${id}`,
        shiftPresenceManagementExceptionSchema,
        {
          ...this.options(),
          ...(signal ? { signal } : {}),
        },
      )
      .then((value) => requirePresenceException(this.target, value, id));
  }
  review(id: string, action: "approve" | "reject", input: unknown) {
    return this.api
      .request(
        `${this.base}/exceptions/${id}/${action}`,
        shiftPresenceManagementExceptionSchema,
        {
          ...this.options(),
          method: "POST",
          body: parseWrite(shiftPresenceExceptionReviewRequestSchema, input),
        },
      )
      .then((value) => requirePresenceException(this.target, value, id));
  }
  async result(
    mutationId: string,
    query: ShiftPresenceManagementResultQuery,
    recoveryOptions?: Pick<
      DashboardApiRequestOptions,
      "signal" | "onAuthReconciled"
    >,
  ) {
    shiftPresenceManagementResultQuerySchema.parse(query);
    const result = await this.api.request(
      `${this.base}/results/${mutationId}`,
      shiftPresenceManagementResultSchema,
      {
        ...(recoveryOptions ?? this.options()),
        ...(this.target.locationId ? { query } : {}),
      },
    );
    return requirePresenceResult(this.target, mutationId, query, result);
  }
}
