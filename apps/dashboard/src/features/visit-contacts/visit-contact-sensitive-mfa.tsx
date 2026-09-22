"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StaffMfaStateValue } from "@valet/contracts";

import { FocusDialog } from "../../components/presentation/focus-dialog";
import { TotpForm } from "../../components/security/mfa-ceremonies";
import { mfaErrorKey } from "../../components/security/mfa-ui";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { DashboardMfaClient } from "../../lib/mfa/dashboard-mfa-client";
import styles from "./visit-contacts.module.css";

export function VisitContactSensitiveMfa(props: {
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
        setError(t(mfaErrorKey(reason)));
        setBusy(false);
      },
    );
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [client, t]);

  async function stepUp(code: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.stepUp({ code });
      if (mounted.current) props.onAssured();
    } catch (reason) {
      if (mounted.current) {
        setError(t(mfaErrorKey(reason)));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <FocusDialog label={t("mfaStatusStepUpRequired")} onClose={props.onClose}>
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeader}>
          <div>
            <h2>{t("mfaStatusStepUpRequired")}</h2>
            <p className={styles.muted}>{t("mfaStepUpBody")}</p>
          </div>
        </div>
        <div className={styles.dialogContent}>
          {busy && state === null ? <p>{t("mfaStatusChecking")}</p> : null}
          {state === "STEP_UP_REQUIRED" || state === "ASSURED"
            ? <TotpForm busy={busy} onSubmit={stepUp} submitLabel="mfaVerify" />
            : null}
          {state === "ENROLLMENT_REQUIRED" || state === "ENROLLMENT_PENDING" ? (
            <Link className={styles.primary} href="/security">{t("accountSecurity")}</Link>
          ) : null}
          {error ? <div className={styles.error} role="alert">{error}</div> : null}
        </div>
      </div>
    </FocusDialog>
  );
}
