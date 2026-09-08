import { ScrollView, Text } from "react-native";
import type {
  EmployeeOperationalSession,
  EmployeeParkingStartSession,
  EmployeeParkingStartSnapshot,
} from "@valet/employee-client";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeBadge,
  EmployeeCard,
  EmployeeErrorNotice,
  EmployeeProgress,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeParkingStartCopy } from "./native-parking-start-copy";
import { nativeParkingStartStyles as s } from "./native-parking-start-styles";

export function NativeParkingStartPanel({
  locale,
  onBack,
  operations,
  parking,
  snapshot,
}: {
  readonly locale: FoundationLocale;
  readonly onBack: () => void;
  readonly operations: EmployeeOperationalSession;
  readonly parking: EmployeeParkingStartSession;
  readonly snapshot: EmployeeParkingStartSnapshot;
}) {
  const copy = getNativeParkingStartCopy(locale);
  const direction = locale === "ar" ? "rtl" : "ltr";
  const textAlign = locale === "ar" ? "right" : "left";
  const busy =
    snapshot.phase === "submitting" || snapshot.phase === "reconciling";
  return (
    <>
      <EmployeeBackHeader
        accessibilityLabel={copy.back}
        direction={direction}
        disabled={busy}
        onBack={onBack}
        textAlign={textAlign}
        title={copy.taskTitle}
      />
      <ScrollView contentContainerStyle={[s.body, { direction }]}>
        {snapshot.phase === "loading" || snapshot.phase === "reconciling" ? (
          <EmployeeProgress
            label={
              snapshot.phase === "loading" ? copy.loading : copy.checkState
            }
            textAlign={textAlign}
          />
        ) : (
          <ParkingContent
            {...{ copy, onBack, operations, parking, snapshot, textAlign }}
          />
        )}
      </ScrollView>
    </>
  );
}

function ParkingContent({
  copy,
  onBack,
  operations,
  parking,
  snapshot,
  textAlign,
}: {
  readonly copy: ReturnType<typeof getNativeParkingStartCopy>;
  readonly onBack: () => void;
  readonly operations: EmployeeOperationalSession;
  readonly parking: EmployeeParkingStartSession;
  readonly snapshot: EmployeeParkingStartSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const task = snapshot.task;
  const vehicle = task?.vehicle;
  const vehicleName =
    [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") ||
    vehicle?.temporaryDescriptor ||
    copy.vehicle;
  if (snapshot.phase === "ambiguous") {
    return (
      <>
        <EmployeeErrorNotice textAlign={textAlign} title={copy.unknownTitle}>
          {copy.unknownBody}
        </EmployeeErrorNotice>
        <EmployeeButton
          label={copy.checkState}
          onPress={() => void parking.checkServerState()}
        />
      </>
    );
  }
  if (snapshot.phase === "conflict") {
    return (
      <>
        <EmployeeErrorNotice textAlign={textAlign} title={copy.conflictTitle}>
          {copy.conflictBody}
        </EmployeeErrorNotice>
        <EmployeeButton
          label={copy.checkState}
          onPress={() => void parking.checkServerState()}
        />
        <EmployeeButton
          label={copy.backToTasks}
          onPress={onBack}
          variant="secondary"
        />
      </>
    );
  }
  if (snapshot.phase === "unavailable" || snapshot.phase === "inactive") {
    return (
      <>
        <EmployeeErrorNotice
          textAlign={textAlign}
          title={copy.unavailableTitle}
        >
          {copy.unavailableBody}
        </EmployeeErrorNotice>
        <EmployeeButton
          label={copy.checkState}
          onPress={() => void parking.checkServerState()}
        />
        <EmployeeButton
          label={copy.backToTasks}
          onPress={onBack}
          variant="secondary"
        />
      </>
    );
  }
  const status =
    snapshot.phase === "started"
      ? copy.statusInProgress
      : task?.status === "QUEUED"
        ? copy.statusQueued
        : snapshot.phase === "assigned"
          ? copy.statusAssigned
          : copy.statusAccepted;
  const accepting =
    task !== null &&
    operations.current().mutation.taskId === task.taskId &&
    (operations.current().mutation.phase === "submitting" ||
      operations.current().mutation.phase === "reconciling");
  return (
    <>
      <EmployeeBadge
        label={status}
        textAlign={textAlign}
        variant={snapshot.phase === "started" ? "success" : "primary"}
      />
      <EmployeeCard>
        {snapshot.phase === "started" ? (
          <Text style={[s.title, employeeTextStyle("human", textAlign)]}>
            {copy.parkingInProgress}
          </Text>
        ) : null}
        <Text style={[s.title, employeeTextStyle("human", textAlign)]}>
          {vehicleName}
        </Text>
        {vehicle?.plateNumberRaw ? (
          <Text
            style={[s.identifier, employeeTextStyle("identifier", textAlign)]}
          >
            {vehicle.plateNumberRaw}
          </Text>
        ) : null}
      </EmployeeCard>
      <EmployeeStatus textAlign={textAlign}>
        {snapshot.phase === "started"
          ? copy.parkingStartedBody
          : snapshot.phase === "assigned"
            ? task?.status === "QUEUED"
              ? copy.queuedBody
              : copy.assignedBody
            : copy.acceptedBody}
      </EmployeeStatus>
      {snapshot.phase === "assigned" ? (
        <EmployeeButton
          busy={accepting}
          disabled={accepting}
          label={task?.status === "QUEUED" ? copy.claimTask : copy.acceptTask}
          onPress={() =>
            void acceptCurrentTask(operations, parking, task?.taskId)
          }
        />
      ) : snapshot.phase === "accepted" ? (
        <EmployeeButton
          label={copy.startParking}
          onPress={() => void parking.startParking()}
        />
      ) : snapshot.phase === "submitting" ? (
        <EmployeeButton
          busy
          disabled
          label={copy.startingParking}
          onPress={() => undefined}
        />
      ) : snapshot.phase === "started" ? (
        <EmployeeButton
          label={copy.backToTasks}
          onPress={onBack}
          variant="secondary"
        />
      ) : null}
    </>
  );
}

async function acceptCurrentTask(
  operations: EmployeeOperationalSession,
  parking: EmployeeParkingStartSession,
  taskId: string | undefined,
) {
  if (taskId === undefined) return;
  await operations.refreshQueue();
  await operations.acceptTask(taskId);
  await parking.checkServerState();
}
