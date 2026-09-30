"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { StaffMfaEnrollmentBeginResponse } from "@valet/contracts";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { BidiText } from "../presentation/panel";
import { Button } from "../presentation/button";

interface TotpFormProps {
  readonly busy: boolean;
  readonly errorId?: string | undefined;
  readonly focusOnMount?: boolean | undefined;
  readonly onSubmit: (code: string) => Promise<void>;
  readonly submitLabel: "mfaConfirmEnrollment" | "mfaVerify" | "mfaReissueRecoveryCodes";
}

export function TotpForm({ busy, errorId, focusOnMount = false, onSubmit, submitLabel }: TotpFormProps) {
  const { t } = useDashboardLocale();
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (busy || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    inputRef.current?.focus();
  }, [busy]);

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = code;
    restoreFocusRef.current = true;
    setCode("");
    await onSubmit(value);
  };

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <div className="field">
        <label htmlFor={`mfa-totp-${submitLabel}`}>{t("mfaTotpCode")}</label>
        <input
          aria-describedby={errorId}
          aria-invalid={errorId ? true : undefined}
          autoComplete="one-time-code"
          disabled={busy}
          dir="ltr"
          id={`mfa-totp-${submitLabel}`}
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          pattern="[0-9]{6}"
          ref={inputRef}
          required
          type="text"
          value={code}
        />
      </div>
      <Button disabled={busy || code.length !== 6} type="submit">
        {t(submitLabel)}
      </Button>
    </form>
  );
}

export function RecoveryForm({
  busy,
  errorId,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly errorId?: string | undefined;
  readonly onSubmit: (recoveryCode: string) => Promise<void>;
}) {
  const { t } = useDashboardLocale();
  const [recoveryCode, setRecoveryCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (busy || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    inputRef.current?.focus();
  }, [busy]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = recoveryCode.trim();
    restoreFocusRef.current = true;
    setRecoveryCode("");
    await onSubmit(value);
  };

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <div className="field">
        <label htmlFor="mfa-recovery-code">{t("mfaRecoveryCode")}</label>
        <input
          aria-describedby={errorId}
          aria-invalid={errorId ? true : undefined}
          autoComplete="off"
          disabled={busy}
          dir="ltr"
          id="mfa-recovery-code"
          onChange={(event) => setRecoveryCode(event.target.value)}
          required
          ref={inputRef}
          spellCheck={false}
          type="text"
          value={recoveryCode}
        />
      </div>
      <Button disabled={busy || recoveryCode.trim().length === 0} type="submit" variant="secondary">
        {t("mfaBeginRecovery")}
      </Button>
    </form>
  );
}

export function EnrollmentCeremony({
  busy,
  enrollment,
  errorId,
  onCancel,
  onConfirm,
}: {
  readonly busy: boolean;
  readonly enrollment: StaffMfaEnrollmentBeginResponse;
  readonly errorId?: string | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: (code: string) => Promise<void>;
}) {
  const { t } = useDashboardLocale();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <div className="stack">
      <div>
        <h2 ref={headingRef} tabIndex={-1}>{t("mfaSetupTitle")}</h2>
        <p className="muted">{t("mfaSetupInstructions")}</p>
      </div>
      <div className="field">
        <span>{t("mfaSetupSecret")}</span>
        <BidiText>{enrollment.provisioning.secretBase32}</BidiText>
        <p className="muted">{t("mfaSetupDetails")}</p>
      </div>
      <TotpForm
        busy={busy}
        errorId={errorId}
        onSubmit={onConfirm}
        submitLabel="mfaConfirmEnrollment"
      />
      <Button disabled={busy} onClick={onCancel} type="button" variant="quiet">
        {t("mfaCancelCeremony")}
      </Button>
    </div>
  );
}

export function RecoveryCodesDisclosure({
  codes,
  onDone,
}: {
  readonly codes: readonly string[];
  readonly onDone: () => void;
}) {
  const { t } = useDashboardLocale();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <div className="stack">
      <div>
        <h2 ref={headingRef} tabIndex={-1}>{t("mfaRecoveryCodesTitle")}</h2>
        <p className="muted">{t("mfaRecoveryCodesBody")}</p>
        <p className="muted">{t("mfaRecoveryCodesWarning")}</p>
      </div>
      <ol>
        {codes.map((code) => (
          <li key={code}>
            <BidiText>{code}</BidiText>
          </li>
        ))}
      </ol>
      <Button onClick={onDone} type="button">
        {t("mfaRecoveryCodesDone")}
      </Button>
    </div>
  );
}
