import type { ReactNode } from "react";

export type PrototypeLocale = "en" | "ar";
export type PrototypeTheme = "light" | "dark";
export type PrototypeRole = "COMPANY_ADMIN" | "LOCATION_MANAGER" | "DENIED";
export type PolicySectionId = "overview" | "company" | "location" | "presence" | "services";

export interface PolicySection {
  readonly id: PolicySectionId;
  readonly label: string;
  readonly description: string;
  readonly group: "company" | "location" | "information";
  readonly readOnly: boolean;
}

export interface PolicyVariantProps {
  readonly locale: PrototypeLocale;
  readonly role: PrototypeRole;
  readonly activeSection: PolicySectionId;
  readonly sections: readonly PolicySection[];
  readonly organizationLabel: string;
  readonly locationLabel: string | null;
  readonly onSelect: (section: PolicySectionId) => void;
  readonly renderPane: (presentation: "classic" | "grouped" | "context" | "compact") => ReactNode;
}
