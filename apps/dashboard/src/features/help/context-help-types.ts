import type { DashboardLocale } from "../../lib/i18n/locale";

export interface ContextHelpText {
  readonly title: string;
  readonly body: string;
}

export type ContextHelpCopy = Readonly<Record<DashboardLocale, ContextHelpText>>;

export type HelpRouteClassification = "CONTENT" | "REDIRECT" | "TEST_ONLY";

// The catalog is static. The later UI phases must mount a specific key only
// inside an already-authorized page or section, never expose a global browser.
