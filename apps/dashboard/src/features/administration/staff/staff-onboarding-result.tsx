"use client";

import type { StaffOnboardingResult } from "@valet/contracts";
import { useEffect, useRef, useState } from "react";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { styles } from "../administration-ui";
import { staffOnboardingCopy } from "./staff-onboarding-copy";

export function StaffOnboardingResultPanel({
  result,
}: {
  readonly result: StaffOnboardingResult;
}) {
  const { locale } = useDashboardLocale();
  const t = staffOnboardingCopy(locale);
  const [message, setMessage] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function copy() {
    if (result.outcome !== "INVITE_ISSUED") return;
    try {
      await navigator.clipboard.writeText(result.activationLink);
      if (active.current) setMessage(t.copied);
    } catch {
      if (active.current) setMessage(t.copyFailed);
    }
  }
  return (
    <div className={styles.stack}>
      <p>{result.outcome === "INVITE_ISSUED" ? t.generated : t.unavailable}</p>
      <p className={styles.muted}>
        {t.expires}:{" "}
        <bdi dir="ltr">{new Date(result.expiresAt).toLocaleString(locale)}</bdi>
      </p>
      {result.outcome === "INVITE_ISSUED" ? (
        <button
          className={styles.primary}
          onClick={() => void copy()}
          type="button"
        >
          {t.copy}
        </button>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
