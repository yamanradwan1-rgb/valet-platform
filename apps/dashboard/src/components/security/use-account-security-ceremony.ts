"use client";

import type {
  StaffMfaEnrollmentBeginResponse,
} from "@valet/contracts";
import { useCallback, useEffect, useState } from "react";

import type { TranslationKey } from "../../lib/i18n/dictionaries";
import {
  ScopeGenerationGuard,
  type ScopeRequestTicket,
} from "../../lib/scope/scope-generation";
import { useAccountSecurityAccess } from "./account-security-access-provider";
import {
  isUncertainMfaMutation,
  mfaErrorKey,
  shouldReconcileMfaMutation,
} from "./mfa-ui";

export interface AccountSecurityCeremonyState {
  readonly beginEnrollment: () => Promise<void>;
  readonly beginRecovery: (recoveryCode: string) => Promise<void>;
  readonly busy: boolean;
  readonly closeEnrollment: () => Promise<void>;
  readonly confirmEnrollment: (code: string) => Promise<void>;
  readonly enrollment: StaffMfaEnrollmentBeginResponse | null;
  readonly errorKey: TranslationKey | null;
  readonly finishRecoveryCodes: () => void;
  readonly recoveryCodes: readonly string[] | null;
  readonly reissueOpen: boolean;
  readonly reissueRecoveryCodes: (code: string) => Promise<void>;
  readonly setReissueOpen: (open: boolean) => void;
  readonly stepUp: (code: string) => Promise<void>;
}

export function useAccountSecurityCeremony(): AccountSecurityCeremonyState {
  const access = useAccountSecurityAccess();
  const [guard] = useState(() => new ScopeGenerationGuard());
  const [enrollment, setEnrollment] =
    useState<StaffMfaEnrollmentBeginResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[] | null>(null);
  const [reissueOpen, setReissueOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const clearSensitive = useCallback(() => {
    setEnrollment(null);
    setRecoveryCodes(null);
  }, []);

  useEffect(() => () => guard.invalidate(), [guard]);
  useEffect(() => {
    if (access.snapshot.status !== "eligible") {
      queueMicrotask(() => {
        clearSensitive();
        setReissueOpen(false);
      });
    }
  }, [access.snapshot.status, clearSensitive]);

  const reconcileFailure = useCallback(
    async (ticket: ScopeRequestTicket, error: unknown) => {
      const uncertain = isUncertainMfaMutation(error);
      clearSensitive();
      setReissueOpen(false);
      const reconciled = await access.refreshState();
      if (!guard.isCurrent(ticket)) return;
      if (reconciled.status === "eligible") {
        setErrorKey(uncertain ? "mfaErrorUncertain" : mfaErrorKey(error));
      } else if (reconciled.status === "ineligible") {
        setErrorKey("mfaErrorAuthorization");
      } else {
        setErrorKey("mfaErrorStateRead");
      }
    },
    [access, clearSensitive, guard],
  );

  const runMutation = useCallback(
    async <T,>(
      operation: (signal: AbortSignal) => Promise<T>,
      publish: (result: T) => void,
    ) => {
      const ticket = guard.begin();
      setBusy(true);
      setErrorKey(null);
      try {
        const result = await operation(ticket.signal);
        if (guard.isCurrent(ticket)) publish(result);
      } catch (error: unknown) {
        if (!guard.isCurrent(ticket)) return;
        if (shouldReconcileMfaMutation(error)) {
          await reconcileFailure(ticket, error);
        } else {
          setErrorKey(mfaErrorKey(error));
        }
      } finally {
        if (guard.isCurrent(ticket)) setBusy(false);
      }
    },
    [guard, reconcileFailure],
  );

  const beginEnrollment = useCallback(
    () =>
      runMutation(
        (signal) => access.client.beginEnrollment(signal),
        (result) => {
          setEnrollment(result);
          setRecoveryCodes(null);
          setReissueOpen(false);
          access.publishState("ENROLLMENT_PENDING");
        },
      ),
    [access, runMutation],
  );

  const confirmEnrollment = useCallback(
    (code: string) => {
      if (!enrollment) return Promise.resolve();
      return runMutation(
        (signal) =>
          access.client.confirmEnrollment(
            { code, factorId: enrollment.factorId },
            signal,
          ),
        (result) => {
          setEnrollment(null);
          setRecoveryCodes(result.recoveryCodes);
          access.publishState("ASSURED");
        },
      );
    },
    [access, enrollment, runMutation],
  );

  const stepUp = useCallback(
    (code: string) =>
      runMutation(
        (signal) => access.client.stepUp({ code }, signal),
        (result) => access.publishState(result.state),
      ),
    [access, runMutation],
  );

  const beginRecovery = useCallback(
    (recoveryCode: string) =>
      runMutation(
        (signal) => access.client.beginRecovery({ recoveryCode }, signal),
        (result) => {
          setEnrollment(result);
          setRecoveryCodes(null);
          access.publishState("ENROLLMENT_PENDING");
        },
      ),
    [access, runMutation],
  );

  const reissueRecoveryCodes = useCallback(
    (code: string) =>
      runMutation(
        (signal) => access.client.reissueRecoveryCodes({ code }, signal),
        (result) => {
          setRecoveryCodes(result.recoveryCodes);
          setReissueOpen(false);
          access.publishState("ASSURED");
        },
      ),
    [access, runMutation],
  );

  const closeEnrollment = useCallback(async () => {
    const ticket = guard.begin();
    clearSensitive();
    setErrorKey(null);
    setBusy(true);
    const result = await access.refreshState();
    if (!guard.isCurrent(ticket)) return;
    if (result.status === "error") setErrorKey("mfaErrorStateRead");
    setBusy(false);
  }, [access, clearSensitive, guard]);

  const finishRecoveryCodes = useCallback(() => {
    setRecoveryCodes(null);
    access.publishState("ASSURED");
  }, [access]);

  return {
    beginEnrollment,
    beginRecovery,
    busy,
    closeEnrollment,
    confirmEnrollment,
    enrollment,
    errorKey,
    finishRecoveryCodes,
    recoveryCodes,
    reissueOpen,
    reissueRecoveryCodes,
    setReissueOpen,
    stepUp,
  };
}
