import { useState, useSyncExternalStore } from "react";
import type { StaffVehicleDirectoryActionsRow } from "@valet/contracts";
import type {
  EmployeeOperationalScope,
  EmployeeVehicleDirectorySnapshot,
} from "@valet/employee-client";
import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeVehiclesScreen } from "./native-vehicles-screen";
import { NativeVehicleCheckInActions } from "./native-vehicle-check-in-actions";
import { NativeCheckInCancelSheet } from "./native-check-in-cancel-sheet";
import { nativeCheckInActionsCopy } from "./native-check-in-actions-copy";

export function NativeVehiclesRoute({
  runtime,
  scope,
  snapshot,
  locale,
  textAlign,
  onContinue,
}: {
  readonly runtime: NativeEmployeeRuntime;
  readonly scope: EmployeeOperationalScope;
  readonly snapshot: EmployeeVehicleDirectorySnapshot;
  readonly locale: FoundationLocale;
  readonly textAlign: "left" | "right";
  readonly onContinue: () => void;
}) {
  const actions = runtime.checkInActions;
  const cancel = actions.cancelSession;
  const state = useSyncExternalStore(
    (listener) => cancel.subscribe(listener),
    () => cancel.current(),
  );
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState<string | null>(null);
  const copy = nativeCheckInActionsCopy(locale);
  const online =
    useSyncExternalStore(
      (listener) => runtime.connectivity.subscribe(listener),
      () => runtime.connectivity.current(),
    ) !== "offline";
  const blocked =
    opening ||
    !online ||
    snapshot.phase !== "ready" ||
    [
      "preparing",
      "confirm",
      "submitting",
      "unknown",
      "reconciling",
      "retry-available",
    ].includes(state.phase);
  return (
    <>
      <NativeVehiclesScreen
        directory={runtime.vehicleDirectory}
        locale={locale}
        scope={scope}
        snapshot={snapshot}
        textAlign={textAlign}
        renderCheckInActions={(row) => {
          const hints = row as Partial<StaffVehicleDirectoryActionsRow>;
          if (
            row.state !== "CHECKING_IN" ||
            !hints.canContinueCheckIn ||
            !hints.canCancelCheckIn
          )
            return null;
          return (
            <NativeVehicleCheckInActions
              copy={copy}
              phase={
                state.sessionId === row.sessionId
                  ? state.phase
                  : openFailed === row.sessionId
                    ? "unavailable"
                    : "inactive"
              }
              disabled={
                !online ||
                opening ||
                snapshot.phase !== "ready" ||
                (blocked && state.sessionId !== row.sessionId)
              }
              onContinue={() => {
                setOpening(true);
                setOpenFailed(null);
                void actions
                  .continue(row.sessionId)
                  .then((ready) => {
                    if (ready) onContinue();
                    else setOpenFailed(row.sessionId);
                  })
                  .finally(() => setOpening(false));
              }}
              onCancel={() => void actions.prepareCancel(row.sessionId)}
              onCheck={() => void actions.reconcile()}
              onRetry={() => cancel.confirmRetry()}
              textAlign={textAlign}
            />
          );
        }}
      />
      {state.phase === "confirm" ? (
        <NativeCheckInCancelSheet
          body={copy.body}
          disabled={!online || snapshot.phase !== "ready"}
          cancel={copy.keep}
          confirm={copy.cancel}
          onClose={() => cancel.dismiss()}
          onConfirm={() => void actions.confirmCancel()}
          textAlign={textAlign}
          title={copy.title}
          variant="danger"
        />
      ) : null}
    </>
  );
}
