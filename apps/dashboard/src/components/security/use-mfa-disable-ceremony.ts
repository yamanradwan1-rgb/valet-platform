"use client";

import type { StaffMfaDisableAvailability } from "@valet/contracts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import type { TranslationKey } from "../../lib/i18n/dictionaries";
import {
  ScopeGenerationGuard,
  type ScopeRequestTicket,
} from "../../lib/scope/scope-generation";
import { useAccountSecurityAccess } from "./account-security-access-provider";
import { isUncertainMfaMutation, mfaErrorKey } from "./mfa-ui";
import { useMfaDisableRefresh } from "./use-mfa-disable-refresh";

interface DisableState {
  readonly key: string;
  readonly availability: StaffMfaDisableAvailability | null;
  readonly factorId: string | null;
  readonly busy: boolean;
  readonly checking: boolean;
  readonly error: TranslationKey | null;
  readonly notice: TranslationKey | null;
}
const empty: DisableState = {
  key: "",
  availability: null,
  factorId: null,
  busy: false,
  checking: false,
  error: null,
  notice: null,
};

export function useMfaDisableCeremony(enabled: boolean, blocked: boolean) {
  const { client, refreshState } = useAccountSecurityAccess();
  const auth = useStaffAuth();
  const key = `${auth.identityGeneration}:${auth.sessionGeneration}`;
  const [guard] = useState(() => new ScopeGenerationGuard());
  const [bound, setBound] = useState<DisableState>(empty);
  const current = bound.key === key ? bound : empty;
  const busy = useRef(false);
  const blockedRef = useRef(blocked);
  useLayoutEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);
  const live = useRef(current);
  const getKey = useCallback(
    () =>
      `${auth.client.getIdentityGeneration()}:${auth.client.getSessionGeneration()}`,
    [auth.client],
  );
  // Update synchronously so duplicate same-tick submissions also see the active command.
  const publish = useCallback((next: DisableState) => {
    live.current = next;
    busy.current = next.busy;
    setBound(next);
  }, []);
  const valid = useCallback(
    (ticket: ScopeRequestTicket, captured: string) =>
      guard.isCurrent(ticket) && captured === getKey(),
    [getKey, guard],
  );
  const read = useCallback(
    async (ticket: ScopeRequestTicket, reconcile: boolean) => {
      const [availability, snapshot] = await Promise.all([
        client.disableAvailability(ticket.signal),
        reconcile ? refreshState(true) : Promise.resolve(null),
      ]);
      if (snapshot && snapshot.status !== "eligible")
        throw new Error("Account security read unavailable.");
      return availability;
    },
    [client, refreshState],
  );
  const refresh = useCallback(
    async (reconcile: boolean | "force" = true) => {
      if (!enabled || busy.current) return;
      const captured = getKey(),
        ticket = guard.begin(),
        previous = live.current;
      try {
        const availability = await read(
          ticket,
          reconcile === "force" || (reconcile && !blockedRef.current),
        );
        if (!valid(ticket, captured)) return;
        const same =
          availability.availability === "AVAILABLE" &&
          availability.expectedFactorId === previous.factorId;
        publish({
          ...previous,
          key: captured,
          availability,
          checking: false,
          factorId: same ? previous.factorId : null,
        });
      } catch {
        if (valid(ticket, captured))
          publish({ ...empty, key: captured, error: "mfaErrorStateRead" });
      }
    },
    [enabled, getKey, guard, publish, read, valid],
  );
  const announce = useMfaDisableRefresh(enabled, busy, refresh);

  useEffect(() => {
    guard.invalidate();
    busy.current = false;
    live.current = empty;
    if (enabled && auth.status === "authenticated") void refresh(false);
    return () => guard.invalidate();
  }, [auth.status, enabled, guard, key, refresh]);

  const open = async () => {
    if (!enabled || blocked || busy.current || live.current.checking) return;
    const captured = getKey(),
      previous = live.current.availability,
      ticket = guard.begin();
    publish({
      ...empty,
      key: captured,
      availability: previous,
      checking: true,
    });
    try {
      const availability = await read(ticket, false);
      if (!valid(ticket, captured)) return;
      const changed =
        previous?.availability === "AVAILABLE" &&
        availability.availability === "AVAILABLE" &&
        previous.expectedFactorId !== availability.expectedFactorId;
      publish({
        ...empty,
        key: captured,
        availability,
        factorId:
          availability.availability === "AVAILABLE" && !changed
            ? availability.expectedFactorId
            : null,
        error: changed ? "mfaErrorStateChanged" : null,
      });
    } catch (error) {
      if (valid(ticket, captured))
        publish({ ...empty, key: captured, error: mfaErrorKey(error) });
    }
  };
  const close = () => {
    if (busy.current) return;
    guard.invalidate();
    publish({ ...live.current, factorId: null, error: null });
  };
  const submit = async (code: string) => {
    const previous = live.current;
    if (
      !enabled ||
      blocked ||
      previous.key !== getKey() ||
      !previous.factorId ||
      busy.current
    )
      return;
    const captured = getKey(),
      ticket = guard.begin();
    publish({ ...previous, busy: true, error: null, notice: null });
    let uncertain = false;
    try {
      await client.disable(
        { code, expectedFactorId: previous.factorId },
        ticket.signal,
      );
      announce();
    } catch (error) {
      if (!valid(ticket, captured)) return;
      uncertain =
        isUncertainMfaMutation(error) ||
        (typeof error === "object" &&
          error !== null &&
          "status" in error &&
          Number(error.status) >= 500);
      if (!uncertain && mfaErrorKey(error) === "mfaErrorVerification") {
        publish({ ...previous, error: "mfaErrorVerification", busy: false });
        return;
      }
      publish({
        ...previous,
        factorId: null,
        busy: true,
        error: uncertain ? null : mfaErrorKey(error),
        notice: uncertain ? "mfaDisableUncertain" : null,
      });
    }
    if (!valid(ticket, captured)) return;
    const feedback = live.current;
    try {
      const availability = await read(ticket, true);
      if (!valid(ticket, captured)) return;
      publish({
        ...feedback,
        key: captured,
        availability,
        factorId: null,
        busy: false,
        notice: uncertain
          ? "mfaDisableUncertain"
          : feedback.error
            ? null
            : availability.availability === "MFA_NOT_ENABLED"
              ? "mfaDisableComplete"
              : "mfaErrorStateChanged",
      });
    } catch {
      if (valid(ticket, captured))
        publish({
          ...empty,
          key: captured,
          error: "mfaErrorStateRead",
          notice: "mfaDisableUncertain",
        });
    }
  };
  return {
    ...current,
    enabled,
    blocked,
    open,
    close,
    submit,
    refresh,
    announce,
  };
}

export type MfaDisableCeremony = ReturnType<typeof useMfaDisableCeremony>;
