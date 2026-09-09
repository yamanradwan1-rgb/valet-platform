import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { EmployeeParkingStartSnapshot } from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeBadge } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeActiveParkingCopy } from "./native-active-parking-copy";
import { nativeActiveParkingStyles as s } from "./native-active-parking-styles";

export function NativeActiveParkingPanel({
  locale,
  onParkVehicle,
  snapshot,
}: {
  readonly locale: FoundationLocale;
  readonly onParkVehicle: () => void;
  readonly snapshot: EmployeeParkingStartSnapshot;
}) {
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
          <InfoRow label={copy.vehicle} value={`${vehicleName} · ${plate}`} />
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
      </ScrollView>
    </>
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
