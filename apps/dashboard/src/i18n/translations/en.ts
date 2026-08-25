import type { TranslationDictionary } from "./types";

import { activeShiftsEn } from "./sections/active-shifts-strings";
import { foundationEn } from "./sections/foundation-strings";
import { incidentsEn } from "./sections/incidents-strings";
import { keysEn } from "./sections/keys-strings";
import { liveOperationsEn } from "./sections/live-operations-strings";
import { locationEn } from "./sections/location-strings";
import { overviewEn } from "./sections/overview-strings";
import { retrievalQueueEn } from "./sections/retrieval-queue-strings";
import { sessionsEn } from "./sections/sessions-strings";
import { sharedEn } from "./sections/shared-strings";
import { tasksEn } from "./sections/tasks-strings";

/**
 * English dictionary composed from the per-surface fragments.
 */
export const enTranslations: TranslationDictionary = {
  ...activeShiftsEn,
  ...foundationEn,
  ...incidentsEn,
  ...keysEn,
  ...liveOperationsEn,
  ...locationEn,
  ...overviewEn,
  ...retrievalQueueEn,
  ...sessionsEn,
  ...sharedEn,
  ...tasksEn,
};
