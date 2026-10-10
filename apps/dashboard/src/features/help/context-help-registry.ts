import type { DashboardLocale } from "../../lib/i18n/locale";
import type { ContextHelpCopy, ContextHelpText } from "./context-help-types";
import { helppages } from "./help-pages";
import { helpoperations } from "./help-operations";
import { helpintelligence } from "./help-intelligence";
import { helpadministration } from "./help-administration";
import { helpsettings } from "./help-settings";
import { helppresence } from "./help-presence";
import { helpaccount } from "./help-account";

export const contextHelpRegistry = {
  ...helppages,
  ...helpoperations,
  ...helpintelligence,
  ...helpadministration,
  ...helpsettings,
  ...helppresence,
  ...helpaccount,
} as const satisfies Record<string, ContextHelpCopy>;

export type ContextHelpKey = keyof typeof contextHelpRegistry;

export function contextHelpFor(
  key: ContextHelpKey,
  locale: DashboardLocale,
): ContextHelpText {
  return contextHelpRegistry[key][locale];
}

export function isContextHelpKey(key: string): key is ContextHelpKey {
  return Object.prototype.hasOwnProperty.call(contextHelpRegistry, key);
}
