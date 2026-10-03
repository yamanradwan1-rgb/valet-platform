import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  type Text,
  type View,
} from "react-native";
import type {
  EmployeeParkingCancellationSession,
  EmployeeParkingStartSnapshot,
} from "@valet/employee-client";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeStatus } from "../employee-ui/employee-feedback";
import { NativeCheckInCancelSheet } from "../vehicles/native-check-in-cancel-sheet";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeParkingCancellationCopy } from "./native-parking-cancellation-copy";

export function NativeParkingCancellationControls({
  session,
  parking,
  locale,
  onCancelled,
  onBack,
}: {
  readonly session: EmployeeParkingCancellationSession;
  readonly parking: EmployeeParkingStartSnapshot;
  readonly locale: FoundationLocale;
  readonly onCancelled: () => void;
  readonly onBack: () => void;
}) {
  const [snapshot, setSnapshot] = useState(session.current);
  const actionRef = useRef<View>(null);
  const summaryRef = useRef<Text>(null);
  const previous = useRef(snapshot.phase);
  const navigated = useRef(false);
  useEffect(() => session.subscribe(setSnapshot), [session]);
  useEffect(() => {
    if (snapshot.phase === "cancelled" && !navigated.current) {
      navigated.current = true;
      onCancelled();
      session.retireCancelled();
    }
  }, [snapshot.phase, onCancelled, session]);
  const copy = getNativeParkingCancellationCopy(locale);
  useEffect(() => {
    if (previous.current === "confirming" && snapshot.phase === "idle")
      focus(actionRef.current);
    if (["uncertain", "retry", "conflict"].includes(snapshot.phase))
      AccessibilityInfo.announceForAccessibility(
        snapshot.phase === "conflict"
          ? copy.conflict
          : snapshot.phase === "retry"
            ? copy.notCancelled
            : copy.unknown,
      );
    previous.current = snapshot.phase;
  }, [snapshot.phase, copy]);
  const textAlign = locale === "ar" ? "right" : "left";
  const task = parking.task;
  const detail = parking.session;
  const eligible =
    ["assigned", "accepted"].includes(parking.phase) &&
    detail?.state === "AWAITING_PARKING" &&
    detail.parking.parkingStartedAt === null;
  const open = () => {
    if (
      !eligible ||
      !task ||
      !detail ||
      !parking.scope ||
      parking.identityGeneration === null
    )
      return;
    session.confirm({
      identityGeneration: parking.identityGeneration,
      scope: parking.scope,
      sessionId: detail.sessionId,
      taskId: task.taskId,
      expectedSessionVersion: detail.version,
      expectedTaskVersion: task.version,
      expectedShiftId: parking.scope.shiftId,
    });
  };
  if (snapshot.phase === "idle")
    return eligible ? (
      <EmployeeButton
        buttonRef={actionRef}
        label={copy.cancelService}
        variant="secondary"
        onPress={open}
      />
    ) : null;
  if (snapshot.phase === "cancelled") return null;
  if (snapshot.phase === "confirming")
    return (
      <NativeCheckInCancelSheet
        focusRef={summaryRef}
        onShow={() => focus(summaryRef.current)}
        body={copy.body}
        cancel={copy.dismiss}
        confirm={copy.confirm}
        disabled={false}
        onClose={() => session.dismiss()}
        onConfirm={() => void session.submit()}
        textAlign={textAlign}
        title={copy.title}
        variant="danger"
      />
    );
  const busy =
    snapshot.phase === "submitting" || snapshot.phase === "reconciling";
  return (
    <>
      <EmployeeStatus textAlign={textAlign}>
        {snapshot.phase === "conflict"
          ? copy.conflict
          : snapshot.phase === "retry"
            ? copy.notCancelled
            : busy
              ? copy.cancelling
              : copy.unknown}
      </EmployeeStatus>
      {snapshot.phase === "retry" ? (
        <EmployeeButton label={copy.retry} onPress={() => session.retry()} />
      ) : snapshot.phase === "conflict" ? (
        <EmployeeButton
          label={copy.back}
          onPress={onBack}
          variant="secondary"
        />
      ) : (
        <EmployeeButton
          label={busy ? copy.cancelling : copy.checkState}
          busy={busy}
          disabled={busy}
          onPress={() => void session.checkServerState()}
        />
      )}
    </>
  );
}

function focus(view: View | Text | null) {
  const handle = view === null ? null : findNodeHandle(view);
  if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
}
