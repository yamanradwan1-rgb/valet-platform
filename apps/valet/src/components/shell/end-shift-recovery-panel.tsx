"use client";

import type { JSX } from "react";

import { useOnlineStatus } from "../../lib/connectivity/use-online-status";
import { useEmployeeI18n, LocaleToggle } from "./employee-i18n";
import { Btn } from "../ui/employee-primitives";

export interface EndShiftRecoveryPanelProps {
  readonly onRetry: () => void;
  readonly onSignOut?: (() => void) | undefined;
}

/**
 * DEC-066 §4: shown instead of the No Active Shift gate while an ambiguous
 * End Shift outcome retains its transient in-memory same-command retry intent.
 * Absence of an active shift is NOT treated as mutation-success proof; the
 * employee can still explicitly retry the SAME command and receive the
 * authoritative idempotent response. No persistence of any kind.
 */
export function EndShiftRecoveryPanel({
  onRetry,
  onSignOut,
}: EndShiftRecoveryPanelProps): JSX.Element {
  const { t } = useEmployeeI18n();
  const isOnline = useOnlineStatus();

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
      <div className="w-full max-w-[340px] space-y-4">
        <div className="w-full bg-white/[0.06] border border-white/10 rounded-3xl p-6 backdrop-blur-sm">
          <p className="font-heading font-bold text-white text-xl mb-2">
            {t.endShiftUncertainTitle}
          </p>
          <p className="text-muted text-sm leading-relaxed">
            {t.endShiftUncertain}
          </p>
        </div>
        {!isOnline && (
          <p className="text-red-200/90 text-xs font-semibold text-center">
            {t.noNetworkMessage}
          </p>
        )}
        <Btn
          label={t.retryEndShift}
          onClick={onRetry}
          variant="primary"
          disabled={!isOnline}
        />
        <div className="flex items-center justify-between pt-1">
          <LocaleToggle />
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="text-muted text-sm font-semibold cursor-pointer hover:text-white transition-colors"
            >
              {t.signOut}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
