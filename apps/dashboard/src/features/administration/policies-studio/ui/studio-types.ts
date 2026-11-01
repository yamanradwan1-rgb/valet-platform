import type { Locale, Role, Scalar, Scope, Section } from "./catalog";

export interface StudioDay {
  weekday: string;
  status: "OPEN" | "CLOSED";
  opensAt?: string;
  closesAt?: string;
}

export interface StudioZone {
  id: string;
  code: string;
  label: string;
  latitude: number;
  longitude: number;
  radius: number;
  status: "ACTIVE" | "DISABLED";
  /** Persisted revision for zone CAS; null only for a new draft. */
  revision: number | null;
}

/** A completed server mutation, or a reason to retain the current draft. */
export type StudioSaveResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "validation"
        | "conflict"
        | "mfa"
        | "forbidden"
        | "unavailable"
        | "error";
      readonly message?: string;
    };

export interface StudioSettingsData {
  readonly defaults: Record<string, Scalar>;
  readonly overrides: Record<string, Scalar>;
  readonly effective: Record<string, Scalar>;
  readonly overridePresent: Record<string, boolean>;
  readonly availableKeys: readonly string[];
  readonly editableKeys: readonly string[];
  readonly busy: boolean;
  readonly error: string | null;
  save(key: string, value: Scalar): Promise<StudioSaveResult>;
  clear(key: string): Promise<StudioSaveResult>;
}

export interface StudioHoursData {
  readonly revision: string | null;
  readonly company: StudioDay[] | null;
  readonly override: StudioDay[] | null;
  readonly effective: StudioDay[] | null;
  readonly inherited: boolean;
  readonly timezone: string | null;
  readonly editable: boolean;
  readonly busy: boolean;
  save(days: StudioDay[] | null): Promise<StudioSaveResult>;
  clear(): Promise<StudioSaveResult>;
}

export type PresenceReadState =
  | "LOADING"
  | "EDITABLE"
  | "READ_ONLY"
  | "ERROR"
  | "DENIED"
  | "NO_LOCATION"
  | "INACTIVE";

export interface StudioPresenceData {
  readonly readState: PresenceReadState;
  /** Real denial/inactive scope, distinct from a transient read/provider error. */
  readonly unavailable?: boolean;
  readonly values: {
    readonly defaults: Record<string, Scalar>;
    readonly overrides: Record<string, Scalar>;
    readonly effective: Record<string, Scalar>;
    readonly overridePresent: Record<string, boolean>;
  };
  readonly readiness: {
    readonly state: "INACTIVE" | "READY" | "BLOCKED" | "UNKNOWN";
    readonly message?: string;
  };
  readonly zones: readonly StudioZone[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly editable: boolean;
  readonly zonesEditable: boolean;
  readonly busy: boolean;
  readonly availableKeys: readonly string[];
  savePolicy(
    key: string,
    value: Scalar,
    clear: boolean,
    strictConfirmed: boolean,
  ): Promise<StudioSaveResult>;
  saveZone(zone: StudioZone): Promise<StudioSaveResult>;
}

export interface StudioWhatsAppData {
  readonly revision: number | null;
  readonly defaults: Record<
    "waEnabled" | "waLanguage" | "waTemplate" | "waBinding",
    Scalar
  >;
  readonly saved: Record<
    "waEnabled" | "waLanguage" | "waTemplate" | "waBinding",
    Scalar
  >;
  readonly templates: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly senders: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly editable: boolean;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  save(values: StudioWhatsAppData["saved"]): Promise<StudioSaveResult>;
}

/** Presentation input only. Callers adapt authoritative app hooks into this shape. */
export interface PoliciesStudioAdapter {
  readonly role: Role;
  readonly locale: Locale;
  readonly organization: { readonly id: string; readonly label: string };
  readonly location: {
    readonly id: string;
    readonly label: string;
    readonly currency: string;
    readonly timezone: string;
  } | null;
  readonly scope: Scope;
  readonly status: "loading" | "ready" | "empty" | "error" | "denied";
  readonly error?: string;
  readonly settings: StudioSettingsData;
  readonly hours: StudioHoursData;
  readonly presence: StudioPresenceData;
  readonly whatsapp: StudioWhatsAppData;
  onScopeChange(scope: Scope): void;
  reload(): Promise<void>;
  canNavigateAway?: () => boolean;
}

export interface StudioRoute {
  readonly section: Section;
  readonly scope: Scope;
  readonly org: string;
  readonly location: string;
  readonly role: Role;
  readonly scenario: PoliciesStudioAdapter["status"];
  readonly setting: string | null;
}
