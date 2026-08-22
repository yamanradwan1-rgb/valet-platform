"use client";

import type { JSX } from "react";

export type OperationalGateModel =
  | { kind: "CONTEXT_ERROR"; message: string }
  | { kind: "LOADING" }
  | { kind: "AMBIGUOUS_ACTIVE_SHIFTS"; count: number }
  | { kind: "NO_ACTIVE_SHIFT" };

export interface EmployeeOperationalGateProps {
  readonly isRetrying?: boolean | undefined;
  readonly model: OperationalGateModel;
  readonly onRetry?: (() => void) | undefined;
  readonly onSignOut?: (() => void) | undefined;
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
 * Truthful operational-context gate for authenticated staff. It states the
 * real context outcome and offers only actions this UI actually owns
 * (retry context refresh, sign out). It never fabricates a persona,
 * location, zone, or shift-start success.
 */
export function EmployeeOperationalGate({
  isRetrying = false,
  model,
  onRetry,
  onSignOut,
}: EmployeeOperationalGateProps): JSX.Element {
  return (
    <GateShell>
      {model.kind === "LOADING" && (
        <>
          <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin mb-6" />
          <p className="text-white font-semibold text-sm">
            Preparing your operational view…
          </p>
        </>
      )}

      {model.kind === "NO_ACTIVE_SHIFT" && (
        <>
          <div className="w-full bg-white/[0.06] border border-white/10 rounded-3xl p-6 mb-6 backdrop-blur-sm">
            <p className="font-heading font-bold text-white text-xl mb-2">
              No active shift
            </p>
            <p className="text-muted text-sm leading-relaxed">
              You do not have an active shift at any location right now.
              Operational tasks appear once a shift is active.
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
                Refresh status
              </button>
            )}
            {onSignOut && (
              <button type="button" onClick={onSignOut} className={gateSecondaryButtonClass}>
                Sign Out
              </button>
            )}
          </div>
        </>
      )}

      {model.kind === "AMBIGUOUS_ACTIVE_SHIFTS" && (
        <>
          <div className="w-full bg-white/[0.06] border border-white/10 rounded-3xl p-6 mb-6 backdrop-blur-sm">
            <p className="font-heading font-bold text-white text-xl mb-2">
              Multiple active shifts
            </p>
            <p className="text-muted text-sm leading-relaxed">
              {model.count} active shifts were found for your account.
              Operations are locked until only one active shift remains.
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
                Refresh status
              </button>
            )}
            {onSignOut && (
              <button type="button" onClick={onSignOut} className={gateSecondaryButtonClass}>
                Sign Out
              </button>
            )}
          </div>
        </>
      )}

      {model.kind === "CONTEXT_ERROR" && (
        <>
          <div className="w-full bg-red-500/10 border border-red-400/30 rounded-3xl p-6 mb-6">
            <p className="font-heading font-bold text-red-200 text-xl mb-2">
              Could not load operational context
            </p>
            <p className="text-red-200/80 text-sm leading-relaxed">
              {model.message}
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
                Retry
              </button>
            )}
            {onSignOut && (
              <button type="button" onClick={onSignOut} className={gateSecondaryButtonClass}>
                Sign Out
              </button>
            )}
          </div>
        </>
      )}
    </GateShell>
  );
}
