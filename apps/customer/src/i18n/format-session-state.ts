import type { TranslationKey } from './translations/types';

const STATE_TRANSLATION_MAP: Readonly<Record<string, TranslationKey>> = {
  CHECKING_IN: 'states.CHECKING_IN',
  AWAITING_PARKING: 'states.AWAITING_PARKING',
  PARKING: 'states.PARKING',
  PARKED: 'states.PARKED',
  REQUESTED: 'states.REQUESTED',
  RETRIEVING: 'states.RETRIEVING',
  READY: 'states.READY',
  HANDOFF_PENDING: 'states.HANDOFF_PENDING',
  COMPLETED: 'states.COMPLETED',
};

export function formatSessionState(
  state: string | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (!state) {
    return t('vehicle.unknown');
  }

  const translationKey = STATE_TRANSLATION_MAP[state];
  if (translationKey) {
    return t(translationKey);
  }

  return state;
}
