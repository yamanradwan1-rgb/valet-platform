"use client";

import type { JSX } from "react";

import type { StartShiftPhase } from "../../features/shift";
import type {
  StaffOperationalLocation,
} from "@valet/contracts";
import { LocaleToggle, useEmployeeI18n } from "./employee-i18n";
import { StartShiftGatePanel } from "./employee-start-shift-panel";

export type OperationalGateModel =
  | { kind: "CONTEXT_ERROR"; message: string }
  | { kind: "LOADING" }
  | { kind: "AMBIGUOUS_ACTIVE_SHIFTS"; count: number }
  | { kind: "NO_ACTIVE_SHIFT" };

export interface EmployeeOperationalGateProps {
  readonly isRetrying?: boolean | undefined;
  readonly model: OperationalGateModel;
  /** Authoritative startable Locations (server-derived eligibleLocations). */
  readonly onStartShift?: ((targetLocationId: string) => void) | undefined;
  readonly onRetryStart?: (() => void) | undefined;
  readonly onDismissStartIntent?: (() => void) | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly onSignOut?: (() => void) | undefined;
  readonly startPhase?: StartShiftPhase | null | undefined;
  readonly startableLocations?: readonly StaffOperationalLocation[] | undefined;
}

function GateShell({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center px-6 pb-10"
      style={{
        background:
          "radial-gradient(ellipse at 55% 0%, #0B2D6E 0%, #07111F 65%)",
      }}
    >
      <img
        src="/brand/VAYLET_Logo_Dark_Background.png"
        alt="VAYLET"
        className="h-9 object-contain mb-12"
      />
      {children}
    </div>
  );
}

const gateButtonClass =
  "w-full h-12 bg-vblue text-white font-bold text-sm rounded-2xl flex items-center justify-center active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-vblue/30 disabled:opacity-60";
const gateSecondaryButtonClass =
  "w-full h-11 text-muted text-sm font-semibold cursor-pointer hover:text-white transition-colors";

/**
 * Truthful operational-context gate for authenticated staff.
 * Localized via the i18n dictionary; LocaleToggle is available pre-auth.
 */
export function EmployeeOperationalGate({
  isRetrying = false,
  model,
  onDismissStartIntent,
  onRetry,
  onRetryStart,
  onSignOut,
  onStartShift,
  startPhase = null,
  startableLocations,
}: EmployeeOperationalGateProps): JSX.Element {
  const { locale, t } = useEmployeeI18n();
  return (
    <GateShell>
      {model.kind === "LOADING" && (
        <>
          <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin mb-6" />
          <p className="text-white font-semibold text-sm">
            {t.loadingContext}
          </p>
        </>
      )}

      {model.kind === "NO_ACTIVE_SHIFT" && (
        <>
          <div className="w-full bg-white/[0.06] border border-white/10 rounded-3xl p-6 mb-6 backdrop-blur-sm">
            <p className="font-heading font-bold text-white text-xl mb-2">
              {t.noActiveShift}
            </p>
            <p className="text-muted text-sm leading-relaxed">
              {t.startShiftPrompt}
            </p>
          </div>
          <div className="w-full space-y-3">
            <LocaleToggle />
            <StartShiftGatePanel
              locations={startableLocations ?? []}
              onDismissIntent={onDismissStartIntent}
              onRetryStart={onRetryStart}
              onStartShift={onStartShift}
              phase={startPhase}
            />
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={isRetrying}
                className={gateSecondaryButtonClass}
              >
                {t.retry}
              </button>
            )}
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className={gateSecondaryButtonClass}
              >
                {t.signOut}
              </button>
            )}
          </div>
        </>
      )}

      {model.kind === "AMBIGUOUS_ACTIVE_SHIFTS" && (
        <>
          <div className="w-full bg-white/[0.06] border border-white/10 rounded-3xl p-6 mb-6 backdrop-blur-sm">
            <p className="font-heading font-bold text-white text-xl mb-2">
              {t.multipleActiveShifts}
            </p>
            <p className="text-muted text-sm leading-relaxed">
              <bdi dir="ltr">{model.count}</bdi> {t.activeShiftsFound}{" "}
              {t.ambiguousShiftDetail}
            </p>
          </div>
          <div className="w-full space-y-3">
            <LocaleToggle />
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={isRetrying}
                className={gateButtonClass}
              >
                {t.retry}
              </button>
            )}
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className={gateSecondaryButtonClass}
              >
                {t.signOut}
              </button>
            )}
          </div>
        </>
      )}

      {model.kind === "CONTEXT_ERROR" && (
        <>
          <div className="w-full bg-red-500/10 border border-red-400/30 rounded-3xl p-6 mb-6">
            <p className="font-heading font-bold text-red-200 text-xl mb-2">
              {t.couldNotLoadContext}
            </p>
            <p className="text-red-200/80 text-sm leading-relaxed">
              {locale === "ar" ? t.operationFailed : model.message}
            </p>
          </div>
          <div className="w-full space-y-3">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={isRetrying}
                className={gateButtonClass}
              >
                {t.retry}
              </button>
            )}
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className={gateSecondaryButtonClass}
              >
                {t.signOut}
              </button>
            )}
          </div>
        </>
      )}
    </GateShell>
  );
}
