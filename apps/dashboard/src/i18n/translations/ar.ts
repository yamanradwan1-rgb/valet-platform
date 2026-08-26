import type { TranslationDictionary } from "./types";

import { activeShiftsAr } from "./sections/active-shifts-strings";
import { analyticsAr } from "./sections/analytics-strings";
import { foundationAr } from "./sections/foundation-strings";
import { financialOverviewAr } from "./sections/financial-overview-strings";
import { incidentsAr } from "./sections/incidents-strings";
import { keysAr } from "./sections/keys-strings";
import { liveOperationsAr } from "./sections/live-operations-strings";
import { locationAr } from "./sections/location-strings";
import { locationSettingsAr } from "./sections/location-settings-strings";
import { mapSetupAr } from "./sections/map-setup-strings";
import { overviewAr } from "./sections/overview-strings";
import { reportsAr } from "./sections/reports-strings";
import { retrievalQueueAr } from "./sections/retrieval-queue-strings";
import { sessionsAr } from "./sections/sessions-strings";
import { sharedAr } from "./sections/shared-strings";
import { tasksAr } from "./sections/tasks-strings";

/**
 * Arabic dictionary composed from the per-surface fragments.
 */
export const arTranslations: TranslationDictionary = {
  ...activeShiftsAr,
  ...analyticsAr,
  ...foundationAr,
  ...financialOverviewAr,
  ...incidentsAr,
  ...keysAr,
  ...liveOperationsAr,
  ...locationAr,
  ...locationSettingsAr,
  ...mapSetupAr,
  ...overviewAr,
  ...reportsAr,
  ...retrievalQueueAr,
  ...sessionsAr,
  ...sharedAr,
  ...tasksAr,
};
