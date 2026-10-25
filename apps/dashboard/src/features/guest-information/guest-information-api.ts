import {
  guestInformationResponseSchema,
  managementGuestContactCompanyResponseSchema,
  managementGuestContactLocationResponseSchema,
  managementGuestInformationOverviewResponseSchema,
  managementGuestPrivacyResponseSchema,
  type ManagementGuestContactCompanyResponse,
  type ManagementGuestContactLocationResponse,
  type ManagementGuestPrivacyResponse,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { normalizePublicPhone } from "./guest-contact-input";
import type {
  ContactDefaults, GuestInformationOverview, LocationContact, LocationPrivacy,
} from "./guest-information-model";

const root = (organizationId: string) =>
  `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}`;
const location = (organizationId: string, locationId: string) =>
  `${root(organizationId)}/locations/${encodeURIComponent(locationId)}/guest-information`;
const canonicalPhone = normalizePublicPhone;
const nullableValue = (value: string | null) => value?.trim() || null;

export function readOverview(
  api: DashboardApiClient, organizationId: string, locale: "en" | "ar",
  signal: AbortSignal,
): Promise<GuestInformationOverview> {
  return api.request(`${root(organizationId)}/guest-information/overview`,
    managementGuestInformationOverviewResponseSchema, {
      signal, query: { locale },
    });
}

export function readPrivacy(
  api: DashboardApiClient, organizationId: string, locationId: string,
  signal: AbortSignal,
): Promise<ManagementGuestPrivacyResponse> {
  return api.request(`${location(organizationId, locationId)}/privacy`,
    managementGuestPrivacyResponseSchema, { signal });
}

export function savePrivacy(
  api: DashboardApiClient, organizationId: string, locationId: string,
  expectedRevision: number, drafts: LocationPrivacy["drafts"],
) {
  return api.request(`${location(organizationId, locationId)}/privacy`,
    managementGuestPrivacyResponseSchema, {
      method: "PUT", body: { expectedRevision, drafts },
    });
}

export function changePublication(
  api: DashboardApiClient, organizationId: string, locationId: string,
  expectedRevision: number, action: "publish" | "unpublish",
) {
  return api.request(`${location(organizationId, locationId)}/privacy/${action}`,
    managementGuestPrivacyResponseSchema, {
      method: "POST", body: { expectedRevision },
    });
}

export function readCompanyContact(
  api: DashboardApiClient, organizationId: string, signal: AbortSignal,
): Promise<ManagementGuestContactCompanyResponse> {
  return api.request(`${root(organizationId)}/guest-information/contact/defaults`,
    managementGuestContactCompanyResponseSchema, { signal });
}

export function saveCompanyContact(
  api: DashboardApiClient, organizationId: string, defaults: ContactDefaults,
) {
  const { revision: expectedRevision, ...values } = defaults;
  return api.request(`${root(organizationId)}/guest-information/contact/defaults`,
    managementGuestContactCompanyResponseSchema, {
      method: "PUT", body: {
        expectedRevision,
        values: {
          ...values,
          displayName: nullableValue(values.displayName),
          phone: canonicalPhone(nullableValue(values.phone)),
          supportUrl: nullableValue(values.supportUrl),
          hours: nullableValue(values.hours),
        },
      },
    });
}

export function readLocationContact(
  api: DashboardApiClient, organizationId: string, locationId: string,
  signal: AbortSignal,
): Promise<ManagementGuestContactLocationResponse> {
  return api.request(`${location(organizationId, locationId)}/contact`,
    managementGuestContactLocationResponseSchema, { signal });
}

export function saveLocationContact(
  api: DashboardApiClient, organizationId: string, locationId: string,
  contact: LocationContact,
) {
  const { revision: expectedRevision, fields, hoursConfirmed } = contact;
  return api.request(`${location(organizationId, locationId)}/contact`,
    managementGuestContactLocationResponseSchema, {
      method: "PUT", body: {
        expectedRevision,
        values: {
          ...fields,
          phone: fields.phone.mode === "OVERRIDE"
            ? { ...fields.phone, value: canonicalPhone(fields.phone.value) }
            : fields.phone,
          hoursConfirmed,
        },
      },
    });
}

export function readPreview(
  api: DashboardApiClient, organizationId: string, locationId: string,
  locale: "en" | "ar", signal: AbortSignal,
) {
  return api.request(`${location(organizationId, locationId)}/preview`,
    guestInformationResponseSchema, { signal, query: { locale } });
}

export function privacyView(dto: ManagementGuestPrivacyResponse): LocationPrivacy {
  return {
    drafts: dto.drafts,
    published: dto.published,
    revision: dto.revision,
    version: dto.publishedVersion ?? 0,
    updatedAt: dto.updatedAt,
  };
}

export function defaultsView(dto: ManagementGuestContactCompanyResponse): ContactDefaults {
  return { ...dto.values, revision: dto.revision };
}

export function contactView(dto: ManagementGuestContactLocationResponse): LocationContact {
  const { hoursConfirmed, ...fields } = dto.values;
  return { fields, hoursConfirmed, revision: dto.revision };
}

// Location managers cannot read the company-wide defaults endpoint. The
// location-scoped response already supplies the effective values they may see.
// Only inherited fields can safely be represented as company defaults here.
