"use client";

import { useCallback, useRef, useState } from "react";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { administrationCopy } from "./administration-copy";
import {
  administrationErrorMessage,
  isConflict,
  isMfaRequired,
} from "./administration-error";

export function useSensitiveMutation(onConflict?: () => void) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);

  const run = useCallback(async <T,>(
    operation: () => Promise<T>,
    onSuccess?: (result: T) => void,
  ): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      onSuccess?.(result);
    } catch (reason) {
      if (isMfaRequired(reason)) {
        setMfaOpen(true);
      } else {
        setError(administrationErrorMessage(reason));
        if (isConflict(reason)) onConflict?.();
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [onConflict]);

  const onMfaAssured = useCallback(() => {
    setMfaOpen(false);
    setError(t.mfaRetry);
  }, [t.mfaRetry]);

  return {
    busy,
    error,
    mfaOpen,
    onMfaAssured,
    closeMfa: () => setMfaOpen(false),
    run,
  } as const;
}
