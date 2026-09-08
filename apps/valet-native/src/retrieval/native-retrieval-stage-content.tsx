import type {
  EmployeeRetrievalSession,
  EmployeeRetrievalSnapshot,
  NativeAuthSession,
  StaffTaskQueueItem,
} from "@valet/employee-client";
import { Text } from "react-native";

import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeBadge,
  EmployeeCard,
  EmployeeErrorNotice,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeParkingQrInput } from "../parking/native-parking-qr-input";
import type { NativeRetrievalCopy } from "./native-retrieval-copy";
import { nativeRetrievalStyles as s } from "./native-retrieval-styles";

interface StageProps {
  readonly copy: NativeRetrievalCopy;
  readonly snapshot: EmployeeRetrievalSnapshot;
  readonly textAlign: "left" | "right";
}

function vehicleIdentifier(task: StaffTaskQueueItem | null): string | null {
  return (
    task?.vehicle.plateNumberRaw?.trim() ||
    task?.vehicle.temporaryDescriptor?.trim() ||
    null
  );
}

function vehicleName(snapshot: EmployeeRetrievalSnapshot, fallback: string) {
  const vehicle = snapshot.task?.vehicle;
  return (
    [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") ||
    vehicle?.temporaryDescriptor ||
    vehicle?.plateNumberRaw ||
    fallback
  );
}

function VehicleCard({ copy, snapshot, textAlign }: StageProps) {
  const identifier = vehicleIdentifier(snapshot.task);
  const zone = snapshot.task?.parkingZone ?? null;
  const spot = snapshot.task?.parkingSpot ?? null;
  return (
    <EmployeeCard>
      <Text style={[s.title, employeeTextStyle("human", textAlign)]}>
        {vehicleName(snapshot, copy.taskTitle)}
      </Text>
      {identifier ? (
        <Text
          style={[s.identifier, employeeTextStyle("identifier", textAlign)]}
        >
          {identifier}
        </Text>
      ) : null}
      {zone || spot ? (
        <Text style={employeeTextStyle("identifier", textAlign)}>
          {[zone, spot].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
    </EmployeeCard>
  );
}

export function NativeRetrievalKeyCheckout({
  auth,
  copy,
  locale,
  retrieval,
  snapshot,
  textAlign,
}: StageProps & {
  readonly auth: NativeAuthSession;
  readonly locale: FoundationLocale;
  readonly retrieval: EmployeeRetrievalSession;
}) {
  const submitting = snapshot.phase === "submitting-start";
  const expectedKey = snapshot.session?.keySlot?.code ?? null;
  return (
    <>
      <EmployeeBadge
        label={copy.keyTitle}
        textAlign={textAlign}
        variant="danger"
      />
      <VehicleCard copy={copy} snapshot={snapshot} textAlign={textAlign} />
      <Text style={[s.expectedKey, employeeTextStyle("identifier", textAlign)]}>
        {expectedKey ?? "N/A"}
      </Text>
      <EmployeeStatus textAlign={textAlign}>
        {copy.keyVerifyBody}
      </EmployeeStatus>
      {!snapshot.keyConfirmed ? (
        <>
          <NativeParkingQrInput
            auth={auth}
            disabled={submitting}
            kind="key-slot"
            label={copy.expectedKeySlot}
            locale={locale}
            onChange={(value) => retrieval.enterKeySlot(value)}
            value={snapshot.keySlotCandidate}
          />
          <EmployeeButton
            disabled={submitting || snapshot.keySlotCandidate.trim() === ""}
            label={copy.keyVerifyLabel}
            onPress={() => void retrieval.confirmKeySlot()}
          />
        </>
      ) : (
        <>
          <EmployeeBadge
            label={copy.keySlotVerified}
            textAlign={textAlign}
            variant="success"
          />
          <EmployeeButton
            busy={submitting}
            disabled={submitting}
            label={submitting ? copy.startingRetrieval : copy.startRetrieval}
            onPress={() => void retrieval.startRetrieval()}
          />
        </>
      )}
    </>
  );
}

export function NativeRetrievalRetrieving({
  copy,
  retrieval,
  snapshot,
  textAlign,
}: StageProps & { readonly retrieval: EmployeeRetrievalSession }) {
  const submitting = snapshot.phase === "submitting-ready";
  return (
    <>
      <EmployeeBadge
        label={copy.retrievingLabel}
        textAlign={textAlign}
        variant="warning"
      />
      <VehicleCard copy={copy} snapshot={snapshot} textAlign={textAlign} />
      <EmployeeStatus textAlign={textAlign}>
        {copy.retrievingBody}
      </EmployeeStatus>
      <EmployeeButton
        busy={submitting}
        disabled={submitting}
        label={submitting ? copy.markingReady : copy.vehicleReady}
        onPress={() => void retrieval.markReady()}
      />
    </>
  );
}

export function NativeRetrievalReady({
  copy,
  onBack,
  snapshot,
  textAlign,
}: StageProps & { readonly onBack: () => void }) {
  return (
    <>
      <EmployeeBadge
        label={copy.readyTitle}
        textAlign={textAlign}
        variant="success"
      />
      <EmployeeCard>
        <Text style={[s.title, employeeTextStyle("human", textAlign)]}>
          {vehicleName(snapshot, copy.taskTitle)}
        </Text>
        {snapshot.readyAt ? (
          <Text style={employeeTextStyle("human", textAlign)}>
            {snapshot.readyAt}
          </Text>
        ) : null}
      </EmployeeCard>
      <EmployeeStatus textAlign={textAlign}>{copy.readyBody}</EmployeeStatus>
      <EmployeeButton label={copy.backToTasks} onPress={onBack} />
    </>
  );
}

export function NativeRetrievalRecover({
  body,
  copy,
  onBack,
  onCheck,
  textAlign,
  title,
}: {
  readonly body: string;
  readonly copy: NativeRetrievalCopy;
  readonly onBack?: (() => void) | undefined;
  readonly onCheck: () => void;
  readonly textAlign: "left" | "right";
  readonly title: string;
}) {
  return (
    <>
      <EmployeeErrorNotice textAlign={textAlign} title={title}>
        {body}
      </EmployeeErrorNotice>
      <EmployeeButton label={copy.checkState} onPress={onCheck} />
      {onBack ? (
        <EmployeeButton
          label={copy.backToTasks}
          onPress={onBack}
          variant="secondary"
        />
      ) : null}
    </>
  );
}
