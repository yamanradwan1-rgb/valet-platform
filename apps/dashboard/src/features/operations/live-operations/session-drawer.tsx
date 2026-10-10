import type {
  LiveSessionOverviewEntry,
  ManagementLocation,
  SessionOverviewEntry,
} from "@valet/contracts";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { operationsCopy } from "../operations-copy";
import { sessionTone } from "../operations-labels";
import { operationalStaffName } from "../operational-staff";
import {
  Fact,
  FactList,
  OperationsDrawer,
  StatusBadge,
} from "../operations-ui";
import {
  formatLiveOperationsTime,
  liveSessionStateLabel,
  liveVehicleLabel,
} from "./live-operations-presentation";
import { historicalStaffName } from "./session-staff-attribution";

function resourceLabel(resource: SessionOverviewEntry["parkingSpot"]): string {
  return resource === null
    ? "—"
    : [resource.code, resource.label].filter(Boolean).join(" · ");
}

export function SessionDrawer({
  history,
  item,
  locale,
  location,
  onClose,
}: {
  // Only Live explicitly supplies protected history. Vehicles never passes it.
  readonly history?: Pick<
    LiveSessionOverviewEntry,
    "checkedInBy" | "parkedBy" | "parkingCompletionProof"
  >;
  readonly item: SessionOverviewEntry;
  readonly locale: DashboardLocale;
  readonly location: ManagementLocation;
  readonly onClose: () => void;
}) {
  const t = operationsCopy(locale);
  const vehicle = liveVehicleLabel(item) ?? t.plateUnavailable;
  const assignee = item.activeTask?.assignee ?? null;
  const time = (value: string) => (
    <bdi dir={locale === "ar" ? "rtl" : "ltr"}>
      {formatLiveOperationsTime(value, location.timezone, locale)}
    </bdi>
  );
  const literal = (value: string | null) => (
    <bdi dir="auto">{value || "—"}</bdi>
  );
  const plate = [item.vehicle.plateCountry, item.vehicle.plateNumberNormalized]
    .filter(Boolean)
    .join(" · ");
  return (
    <OperationsDrawer
      label={t.details}
      onClose={onClose}
      subtitle={<bdi>{vehicle}</bdi>}
    >
      <FactList>
        <Fact label={t.vehicle} value={literal(vehicle)} />
        <Fact label={t.plate} value={literal(plate)} />
        <Fact
          label={locale === "ar" ? "اللون" : "Color"}
          value={literal(item.vehicle.color)}
        />
        <Fact
          label={history === undefined ? t.assignee : t.liveCurrentAssignee}
          value={
            history === undefined
              ? literal(operationalStaffName(assignee, locale))
              : literal(
                  assignee === null
                    ? item.activeTask === null
                      ? t.liveNoActiveAssignment
                      : t.unassigned
                    : operationalStaffName(assignee, locale),
                )
          }
        />
        <Fact
          label={locale === "ar" ? "البريد الإلكتروني" : "Email"}
          value={literal(assignee?.identity.email ?? null)}
        />
        {history !== undefined ? (
          <>
            <Fact
              label={t.liveOriginalCheckIn}
              value={literal(
                historicalStaffName(history.checkedInBy) ?? t.liveUnknownStaff,
              )}
            />
            {history.parkingCompletionProof === "PROVEN" ? (
              <Fact
                label={t.liveParkedBy}
                value={literal(
                  historicalStaffName(history.parkedBy) ?? t.liveUnknownStaff,
                )}
              />
            ) : null}
          </>
        ) : null}
        <Fact
          label={t.state}
          value={
            <StatusBadge tone={sessionTone(item.state)}>
              {liveSessionStateLabel(item.state, locale)}
            </StatusBadge>
          }
        />
        <Fact label={t.location} value={location.name} />
        <Fact label={t.keySlot} value={literal(resourceLabel(item.keySlot))} />
        <Fact
          label={t.parkingZone}
          value={literal(resourceLabel(item.parkingZone))}
        />
        <Fact
          label={locale === "ar" ? "مكان الاصطفاف" : "Parking Spot"}
          value={literal(resourceLabel(item.parkingSpot))}
        />
        <Fact label={t.created} value={time(item.createdAt)} />
        <Fact label={t.updated} value={time(item.updatedAt)} />
      </FactList>
    </OperationsDrawer>
  );
}
