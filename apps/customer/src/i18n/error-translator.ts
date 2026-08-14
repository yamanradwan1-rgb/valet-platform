import { GuestApiError } from '../lib/api/api-error';
import type { TranslationKey } from './translations/types';

export function getLocalizedErrorMessage(
  err: unknown,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  if (err instanceof GuestApiError) {
    if (err.isNetworkError) {
      return t('errors.NETWORK_ERROR');
    }

    const key = `errors.${err.code}` as TranslationKey;
    const translated = t(key);
    // If translation key resolved to a valid string (not the raw key name), return it
    if (translated !== key) {
      return translated;
    }

    return err.message || t('errors.REQUEST_FAILED');
  }

  if (err instanceof Error) {
    if (
      err.name === 'TypeError' &&
      (err.message.includes('fetch') || err.message.includes('network'))
    ) {
      return t('errors.NETWORK_ERROR');
    }
  }

  return t('errors.GENERIC_ERROR');
}
