import type { DashboardLocale } from "../../lib/i18n/locale";

export type GuestLanguage = DashboardLocale;
export type ContactField = "displayName" | "phone" | "supportUrl" | "hours";
export const CONTACT_FIELDS: readonly ContactField[] = [
  "displayName", "phone", "supportUrl", "hours",
];

export interface PolicyContent {
  readonly text: string;
  readonly url: string;
}

export interface LocationPrivacy {
  readonly drafts: Readonly<Record<GuestLanguage, PolicyContent>>;
  readonly published: Readonly<Record<GuestLanguage, PolicyContent>> | null;
  readonly revision: number;
  readonly version: number;
  readonly updatedAt: string | null;
}

export interface ContactDefaults {
  readonly displayName: string | null;
  readonly phone: string | null;
  readonly supportUrl: string | null;
  readonly hours: string | null;
  readonly hoursConfirmed: boolean;
  readonly revision: number;
}

export interface ContactOverride {
  readonly mode: "INHERIT" | "OVERRIDE" | "UNAVAILABLE";
  readonly value: string | null;
}

export interface LocationContact {
  readonly fields: Readonly<Record<ContactField, ContactOverride>>;
  readonly hoursConfirmed: boolean;
  readonly revision: number;
}

export interface LocationOverview {
  readonly id: string;
  readonly name: string;
  readonly privacy: "PUBLISHED" | "UNAVAILABLE" | "DRAFT" | "NOT_SET";
  readonly contact: "AVAILABLE" | "NOT_SET";
}

export interface GuestInformationOverview {
  readonly companyName: string;
  readonly locations: readonly LocationOverview[];
  readonly publishedCount: number;
}

export function visiblePolicy(privacy: LocationPrivacy, locale: GuestLanguage) {
  const part = privacy.published?.[locale];
  return part && (part.text.trim() || part.url.trim()) ? part : null;
}

export function policyStatus(privacy: LocationPrivacy, locale: GuestLanguage):
  "PUBLISHED" | "UNAVAILABLE" | "DRAFT" | "NOT_SET" {
  if (visiblePolicy(privacy, locale)) return "PUBLISHED";
  if (privacy.published && Object.values(privacy.published).some((item) =>
    item.text.trim() || item.url.trim())) return "UNAVAILABLE";
  if (Object.values(privacy.drafts).some((item) => item.text.trim() || item.url.trim()))
    return "DRAFT";
  return "NOT_SET";
}

export function effectiveContact(
  defaults: ContactDefaults,
  overrides: LocationContact,
  field: ContactField,
): { readonly value: string | null; readonly source: "Location" | "Company" } {
  const override = overrides.fields[field];
  if (override.mode === "UNAVAILABLE") return { value: null, source: "Location" };
  const isLocal = override.mode === "OVERRIDE";
  const value = isLocal ? override.value : defaults[field];
  const verified = isLocal ? overrides.hoursConfirmed : defaults.hoursConfirmed;
  return {
    value: field === "hours" && !verified ? null : value,
    source: isLocal ? "Location" : "Company",
  };
}

export function contactCounts(defaults: ContactDefaults, contact: LocationContact) {
  let configured = 0;
  let customized = 0;
  for (const field of CONTACT_FIELDS) {
    const resolved = effectiveContact(defaults, contact, field);
    if (resolved.value) configured += 1;
    if (contact.fields[field].mode !== "INHERIT") customized += 1;
  }
  return { configured, customized };
}

// A Location Manager can read the location-scoped effective projection, but
// cannot call the Company Admin defaults endpoint. Never infer hidden company
// fields from an overridden Location value.
export function scopedEffectiveDefaults(dto: {
  readonly values: Readonly<Record<ContactField, ContactOverride>>;
  readonly effective: Readonly<Record<ContactField, { readonly value: string | null }>>;
}): ContactDefaults {
  const inherited = (field: ContactField) =>
    dto.values[field].mode === "INHERIT" ? dto.effective[field].value : null;
  const hours = inherited("hours");
  return {
    displayName: inherited("displayName"),
    phone: inherited("phone"),
    supportUrl: inherited("supportUrl"),
    hours,
    hoursConfirmed: hours !== null,
    revision: 0,
  };
}

export function validHttps(value: string): boolean {
  if (!value.trim()) return true;
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validPhone(value: string): boolean {
  if (!value.trim()) return true;
  if (!/^\+[1-9][\d\s()-]*$/.test(value)) return false;
  return /^\+[1-9]\d{6,14}$/.test(value.replace(/[\s()-]/g, ""));
}
