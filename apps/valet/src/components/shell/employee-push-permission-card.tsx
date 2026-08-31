"use client";

import type { JSX } from "react";

import { useEmployeeWebPush } from "../../features/employee-web-push/employee-web-push-provider";
import { useEmployeeI18n } from "./employee-i18n";

export function EmployeePushPermissionCard(): JSX.Element | null {
  const push = useEmployeeWebPush();
  const { t } = useEmployeeI18n();
  if (push.state === "SUBSCRIBED") return null;

  const copy = {
    DENIED: t.pushDenied,
    GRANTED_UNSUBSCRIBED: t.pushEnableDescription,
    IOS_REQUIRES_HOME_SCREEN: t.pushIosHomeScreen,
    PROMPT_AVAILABLE: t.pushEnableDescription,
    RECOVERABLE_ERROR: t.pushRecoverable,
    UNAVAILABLE: t.pushUnavailable,
    UNSUPPORTED: t.pushUnsupported,
  }[push.state];
  const actionable =
    push.state === "PROMPT_AVAILABLE" ||
    push.state === "GRANTED_UNSUBSCRIBED" ||
    push.state === "RECOVERABLE_ERROR";

  return (
    <section className="mx-4 mt-3 rounded-xl border border-vblue/20 bg-white p-3 text-sm">
      <p className="font-bold text-navy">{t.pushTitle}</p>
      <p className="mt-1 text-neutral">{copy}</p>
      {actionable ? (
        <button
          className="mt-2 rounded-lg bg-vblue px-3 py-2 font-bold text-white"
          onClick={() => void push.enable()}
          type="button"
        >
          {push.state === "RECOVERABLE_ERROR" ? t.pushRetry : t.pushEnable}
        </button>
      ) : null}
    </section>
  );
}
