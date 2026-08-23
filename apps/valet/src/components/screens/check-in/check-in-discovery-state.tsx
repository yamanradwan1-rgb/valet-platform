import type { JSX } from "react";

import type { Screen } from "../../../types/employee-ui";
import { useEmployeeI18n } from "../../shell/employee-i18n";
import { BackHeader, Btn } from "../../ui/employee-primitives";

export function CheckInDiscoveryLoading(): JSX.Element {
  const { t } = useEmployeeI18n();
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 space-y-4">
      <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin" />
      <p className="text-navy font-semibold text-sm">{t.checkingDrafts}</p>
    </div>
  );
}

export function CheckInDiscoveryError({
  message,
  nav,
  onRetry,
}: {
  readonly message: string;
  readonly nav: (screen: Screen) => void;
  readonly onRetry: () => void;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  return (
    <div>
      <BackHeader title={t.checkInDiscovery} onBack={() => nav("task-queue")} />
      <div className="p-5 space-y-4">
        <div className="p-4 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-sm">
          <p className="font-bold">{t.failedCheckIn}</p>
          <p className="text-xs mt-1">{message}</p>
        </div>
        <Btn label={t.retryDiscovery} onClick={onRetry} />
        <Btn label={t.backToQueue} variant="secondary" onClick={() => nav("task-queue")} />
      </div>
    </div>
  );
}
