import type { TranslationDictionary } from "./types";

import { activeShiftsAr } from "./sections/active-shifts-strings";
import { foundationAr } from "./sections/foundation-strings";
import { incidentsAr } from "./sections/incidents-strings";
import { keysAr } from "./sections/keys-strings";
import { overviewAr } from "./sections/overview-strings";
import { retrievalQueueAr } from "./sections/retrieval-queue-strings";
import { sessionsAr } from "./sections/sessions-strings";
import { sharedAr } from "./sections/shared-strings";
import { tasksAr } from "./sections/tasks-strings";

/**
 * Arabic dictionary composed from the per-surface fragments.
 */
export const arTranslations: TranslationDictionary = {
  ...activeShiftsAr,
  ...foundationAr,
  ...incidentsAr,
  ...keysAr,
  ...overviewAr,
  ...retrievalQueueAr,
  ...sessionsAr,
  ...sharedAr,
  ...tasksAr,
};
