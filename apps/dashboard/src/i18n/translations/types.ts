import type { DashboardSessionState } from "@valet/contracts";

import type { ActiveShiftsStrings } from "./sections/active-shifts-strings";
import type { AnalyticsStrings } from "./sections/analytics-strings";
import type { FoundationStrings } from "./sections/foundation-strings";
import type { FinancialOverviewStrings } from "./sections/financial-overview-strings";
import type { IncidentsStrings } from "./sections/incidents-strings";
import type { KeysStrings } from "./sections/keys-strings";
import type { LiveOperationsStrings } from "./sections/live-operations-strings";
import type { LocationStrings } from "./sections/location-strings";
import type { MapSetupStrings } from "./sections/map-setup-strings";
import type { OverviewStrings } from "./sections/overview-strings";
import type { RetrievalQueueStrings } from "./sections/retrieval-queue-strings";
import type { SessionsStrings } from "./sections/sessions-strings";
import type { SharedStrings } from "./sections/shared-strings";
import type { TasksStrings } from "./sections/tasks-strings";

/**
 * Typed translation dictionary for the Management Dashboard.
 *
 * Keys are grouped by surface modules under ./sections/. The English
 * dictionary is the source shape; the Arabic dictionary must implement
 * exactly the same keys, which is enforced at compile time by the shared
 * fragment interfaces.
 */
export interface TranslationDictionary
  extends
    ActiveShiftsStrings,
    AnalyticsStrings,
    FoundationStrings,
    FinancialOverviewStrings,
    IncidentsStrings,
    KeysStrings,
    LiveOperationsStrings,
    LocationStrings,
    MapSetupStrings,
    OverviewStrings,
    RetrievalQueueStrings,
    SessionsStrings,
    SharedStrings,
    TasksStrings {}

export type TranslationKey = keyof TranslationDictionary;

export type { DashboardSessionState };
