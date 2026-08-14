import { GuestApiError } from '../lib/api/api-error';
import { arTranslations } from './translations/ar';
import { enTranslations } from './translations/en';
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
    // Check if the code is actually a known translation key in our dictionary
    if (key in enTranslations || key in arTranslations) {
      return t(key);
    }

    // NEVER return raw backend err.message for unknown error codes
    return t('errors.REQUEST_FAILED');
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
