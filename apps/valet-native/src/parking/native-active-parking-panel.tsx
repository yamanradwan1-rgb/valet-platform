import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { EmployeeParkingStartSnapshot } from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeBadge } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeActiveParkingCopy } from "./native-active-parking-copy";
import { nativeActiveParkingStylesTheme as sTheme } from "./native-active-parking-styles";

export function NativeActiveParkingPanel({
  locale,
  onParkVehicle,
  onReportIssue,
  snapshot,
}: {
  readonly locale: FoundationLocale;
  readonly onParkVehicle: () => void;
  readonly onReportIssue?: ((sessionId: string) => void) | undefined;
  readonly snapshot: EmployeeParkingStartSnapshot;
}) {
  const s = useEmployeeStyles(sTheme);

  const copy = getNativeActiveParkingCopy(locale);
  const textAlign = locale === "ar" ? "right" : "left";
  const direction = locale === "ar" ? "rtl" : "ltr";
  const vehicle = snapshot.session?.vehicle;
  const vehicleName =
    [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || copy.vehicle;
  const plate = vehicle?.plateNumberRaw ?? vehicle?.temporaryDescriptor ?? "—";
  const zone = snapshot.session?.parking.parkingZoneCode;
  const destination = zone ? `${copy.zone} ${zone}` : copy.parkingArea;
  const startedAt = snapshot.session?.parking.parkingStartedAt ?? null;

  return (
    <>
      <View style={[s.header, { direction }]}>
        <EmployeeBadge label={copy.parking} textAlign={textAlign} />
        <Text style={[s.heading, employeeTextStyle("human", textAlign)]}>
          {copy.parking} {vehicleName}
        </Text>
      </View>
      <ScrollView contentContainerStyle={[s.body, { direction }]}>
        <View style={s.elapsedCard}>
          <Text style={s.elapsedLabel}>{copy.elapsed}</Text>
          <ElapsedValue startTimeIso={startedAt} />
        </View>
        <View style={s.detailCard}>
          <VehicleInfoRow
            label={copy.vehicle}
            plate={plate}
            textAlign={textAlign}
            vehicleName={vehicleName}
          />
          {snapshot.session?.keySlot?.code ? (
            <InfoRow
              bordered
              label={copy.key}
              value={snapshot.session.keySlot.code}
            />
          ) : null}
          <InfoRow bordered label={copy.destination} value={destination} />
        </View>
        <EmployeeButton label={copy.parkVehicle} onPress={onParkVehicle} />
        {snapshot.session && onReportIssue ? (
          <EmployeeButton
            label={copy.reportIssue}
            onPress={() => onReportIssue(snapshot.session!.sessionId)}
            variant="secondary"
          />
        ) : null}
      </ScrollView>
    </>
  );
}

function VehicleInfoRow({
  label,
  plate,
  textAlign,
  vehicleName,
}: {
  readonly label: string;
  readonly plate: string;
  readonly textAlign: "left" | "right";
  readonly vehicleName: string;
}) {
  const s = useEmployeeStyles(sTheme);

  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, employeeTextStyle("human", textAlign)]}>
        {label}
      </Text>
      <View
        style={{
          alignItems: textAlign === "right" ? "flex-end" : "flex-start",
          flexDirection: "row",
          gap: 4,
        }}
      >
        <Text style={[s.rowValue, employeeTextStyle("human", textAlign)]}>
          {vehicleName} ·
        </Text>
        <Text style={[s.rowValue, employeeTextStyle("identifier", textAlign)]}>
          {plate}
        </Text>
      </View>
    </View>
  );
}

function InfoRow({
  bordered = false,
  label,
  value,
}: {
  readonly bordered?: boolean;
  readonly label: string;
  readonly value: string;
}) {
  const s = useEmployeeStyles(sTheme);

  return (
    <View style={[s.row, bordered && s.rowBorder]}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, employeeTextStyle("identifier", "left")]}>
        {value}
      </Text>
    </View>
  );
}

function ElapsedValue({
  startTimeIso,
}: {
  readonly startTimeIso: string | null;
}) {
  const s = useEmployeeStyles(sTheme);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const started = startTimeIso === null ? now : Date.parse(startTimeIso);
  const seconds = Math.max(0, Math.floor((now - started) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return (
    <Text style={s.elapsedValue}>
      {[hours, minutes, rest]
        .map((part) => String(part).padStart(2, "0"))
        .join(":")}
    </Text>
  );
}
