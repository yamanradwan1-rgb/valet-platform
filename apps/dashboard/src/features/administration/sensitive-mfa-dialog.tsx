"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StaffMfaStateValue } from "@valet/contracts";

import { FocusDialog } from "../../components/presentation/focus-dialog";
import { TotpForm } from "../../components/security/mfa-ceremonies";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardMfaClient } from "../../lib/mfa/dashboard-mfa-client";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { styles } from "./administration-ui";

export function SensitiveMfaDialog(props: {
  readonly api: DashboardApiClient;
  readonly onAssured: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useDashboardLocale();
  const client = useMemo(() => new DashboardMfaClient(props.api), [props.api]);
  const [state, setState] = useState<StaffMfaStateValue | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void client.state(controller.signal).then(
      (response) => {
        if (!mounted.current) return;
        setState(response.state);
        setBusy(false);
      },
      (reason: unknown) => {
        if (!mounted.current || controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : t("mfaErrorStateRead"));
        setBusy(false);
      },
    );
    return () => { mounted.current = false; controller.abort(); };
  }, [client, t]);

  async function stepUp(code: string): Promise<void> {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await client.stepUp({ code });
      if (mounted.current) props.onAssured();
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : t("unavailable"));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <FocusDialog label={t("mfaStatusStepUpRequired")} onClose={props.onClose}>
      <h2 className={styles.dialogTitle}>{t("mfaStatusStepUpRequired")}</h2>
      <p className={styles.dialogSubtitle}>{t("mfaStepUpBody")}</p>
      {busy && state === null ? <p className={styles.muted}>{t("mfaStatusChecking")}</p> : null}
      {state === "STEP_UP_REQUIRED" ? <TotpForm busy={busy} onSubmit={stepUp} submitLabel="mfaVerify" /> : null}
      {state === "ENROLLMENT_REQUIRED" || state === "ENROLLMENT_PENDING" ? (
        <div className={styles.stack}>
          <p className={styles.muted}>{t(state === "ENROLLMENT_REQUIRED" ? "mfaEnrollmentRequiredBody" : "mfaEnrollmentPendingBody")}</p>
          <Link className={styles.primary} href="/security">{t("accountSecurity")}</Link>
        </div>
      ) : null}
      {state === "ASSURED" ? <button className={styles.primary} onClick={props.onAssured} type="button">{t("retry")}</button> : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </FocusDialog>
  );
}
