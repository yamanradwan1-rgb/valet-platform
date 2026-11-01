"use client";

import { useEffect } from "react";
import type { NestedMfaReadResult } from "../../components/foundation/protected-dashboard-context";
import { nestedMfaReadResult } from "../../components/foundation/use-nested-mfa-bridge";

interface ReadStatus {
  readonly error: Error | null;
  readonly loading: boolean;
  readonly data: unknown | null;
}

export function useGuestInformationMfaRead(input: {
  readonly onRead: ((result: NestedMfaReadResult) => void) | undefined;
  readonly overview: ReadStatus;
  readonly privacy: ReadStatus;
  readonly defaults: ReadStatus;
  readonly contact: ReadStatus;
  readonly preview: ReadStatus;
  readonly isCompanyAdmin: boolean;
}) {
  const {
    onRead,
    overview,
    privacy,
    defaults,
    contact,
    preview,
    isCompanyAdmin,
  } = input;
  useEffect(() => {
    const result = nestedMfaReadResult(
      [
        overview.error,
        privacy.error,
        defaults.error,
        contact.error,
        preview.error,
      ],
      Boolean(
        !overview.loading &&
        !preview.loading &&
        !privacy.loading &&
        !contact.loading &&
        (!isCompanyAdmin || !defaults.loading) &&
        overview.data &&
        preview.data &&
        privacy.data &&
        contact.data &&
        (!isCompanyAdmin || defaults.data),
      ),
    );
    if (result) onRead?.(result);
  }, [
    onRead,
    overview.error,
    privacy.error,
    defaults.error,
    contact.error,
    preview.error,
    overview.loading,
    preview.loading,
    privacy.loading,
    contact.loading,
    defaults.loading,
    overview.data,
    preview.data,
    privacy.data,
    contact.data,
    defaults.data,
    isCompanyAdmin,
  ]);
}
