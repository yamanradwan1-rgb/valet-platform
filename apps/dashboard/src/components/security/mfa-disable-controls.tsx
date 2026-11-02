"use client";

import { useEffect, useRef } from "react";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { Button } from "../presentation/button";
import { FocusDialog } from "../presentation/focus-dialog";
import { TotpForm } from "./mfa-ceremonies";
import type { MfaDisableCeremony } from "./use-mfa-disable-ceremony";

export function MfaDisableControls({
  ceremony,
}: {
  readonly ceremony: MfaDisableCeremony;
}) {
  const { t } = useDashboardLocale();
  const restoreFocus = useRef(false);
  const close = () => {
    if (ceremony.busy) return;
    restoreFocus.current = true;
    ceremony.close();
  };
  useEffect(() => {
    if (ceremony.factorId || !restoreFocus.current) return;
    restoreFocus.current = false;
    document.getElementById("mfa-disable-trigger")?.focus();
  }, [ceremony.factorId]);
  if (!ceremony.enabled) return null;
  const error = ceremony.error ? (
    <p className="error-text" id="mfa-disable-error" role="alert">
      {t(ceremony.error)}
    </p>
  ) : null;
  return (
    <div className="stack">
      {ceremony.notice ? <p role="status">{t(ceremony.notice)}</p> : null}
      {!ceremony.factorId ? error : null}
      {ceremony.availability?.availability === "MFA_REQUIRED_BY_POLICY" ? (
        <p className="muted">{t("mfaDisablePolicy")}</p>
      ) : null}
      {ceremony.availability?.availability === "AVAILABLE" ? (
        <Button
          id="mfa-disable-trigger"
          disabled={ceremony.blocked || ceremony.busy || ceremony.checking}
          onClick={() => void ceremony.open()}
          type="button"
          variant="secondary"
        >
          {t("mfaDisable")}
        </Button>
      ) : ceremony.availability === null ? (
        <Button
          disabled={ceremony.busy}
          onClick={() => void ceremony.refresh()}
          type="button"
          variant="quiet"
        >
          {t("retry")}
        </Button>
      ) : null}
      {ceremony.factorId ? (
        <FocusDialog label={t("mfaDisable")} onClose={close}>
          <div className="stack">
            <h2>{t("mfaDisable")}</h2>
            <p>{t("mfaDisableImpact")}</p>
            {error}
            <TotpForm
              busy={ceremony.busy}
              errorId={ceremony.error ? "mfa-disable-error" : undefined}
              focusOnMount
              onSubmit={ceremony.submit}
              submitLabel="mfaDisableConfirm"
            />
            <Button
              disabled={ceremony.busy}
              onClick={close}
              type="button"
              variant="quiet"
            >
              {t("mfaCancelCeremony")}
            </Button>
          </div>
        </FocusDialog>
      ) : null}
    </div>
  );
}
