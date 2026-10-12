"use client";
import {
  staffManagementDisplayName,
  type StaffShiftHistoryEntry,
} from "@valet/contracts";
import type { ReactNode } from "react";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { AdministrationDrawer } from "../administration-drawer";
import { ReadState, StatusBadge, styles } from "../administration-ui";
import { administrationErrorMessage } from "../administration-error";
import { formatStaffTime } from "./staff-presentation";
import { staffRoleLabel } from "./staff-labels";
import { staffShiftHistoryCopy } from "./staff-shift-history-copy";
import { shiftDuration } from "./staff-shift-time";
import { ScopedContextHelp } from "../../help/scoped-context-help";
export function StaffShiftDrawer(props: {
  readonly item: StaffShiftHistoryEntry | null;
  readonly loading: boolean;
  readonly error: Error | null;
  readonly now: number;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly action?: ReactNode;
  readonly dialog?: ReactNode;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale),
    h = staffShiftHistoryCopy(locale);
  const item = props.item;
  const time = (value: string | null) => (
    <bdi dir={locale === "ar" ? "rtl" : "ltr"}>
      {value && item
        ? formatStaffTime(value, item.location.timezone, locale)
        : "—"}
    </bdi>
  );
  return (
    <AdministrationDrawer label={h.details} onClose={props.onClose}>
      <ReadState
        loading={props.loading}
        error={
          props.error
            ? new Error(administrationErrorMessage(props.error))
            : null
        }
        onRetry={props.onRetry}
      >
        {item ? (
          <div className={styles.stack}>
            <Fact
              label={h.employee}
              value={
                <bdi dir="auto">
                  {staffManagementDisplayName(item.identity)}
                </bdi>
              }
            />
            <Fact
              label={t.email}
              value={<bdi dir="ltr">{item.identity.email}</bdi>}
            />
            <Fact
              label={h.currentRole}
              value={staffRoleLabel(item.currentRole, t)}
            />
            <Fact
              label={t.status}
              value={
                <StatusBadge
                  {...(item.status === "ACTIVE" ? { good: true } : {})}
                >
                  {item.status === "ACTIVE" ? t.active : h.ended}
                </StatusBadge>
              }
            />
            <Fact
              label={t.location}
              value={<bdi dir="auto">{item.location.name}</bdi>}
            />
            <Fact
              label={t.locationCode}
              value={<bdi dir="ltr">{item.location.code}</bdi>}
            />
            <Fact label={t.startedAt} value={time(item.startedAt)} />
            <Fact label={h.endedAt} value={time(item.endedAt)} />
            <Fact
              label={h.duration}
              value={shiftDuration(item, props.now, locale)}
            />
            <div className={styles.actions}>
              {props.action}
              <ScopedContextHelp helpKey="staff.details" />
            </div>
          </div>
        ) : null}
      </ReadState>
      {props.dialog}
    </AdministrationDrawer>
  );
}
function Fact(props: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div>
      <div className={styles.muted}>{props.label}</div>
      <div className={styles.strong}>{props.value}</div>
    </div>
  );
}
