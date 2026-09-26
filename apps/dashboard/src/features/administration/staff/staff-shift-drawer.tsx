"use client";

import type { ActiveShiftOverviewEntry, ManagementLocation } from "@valet/contracts";
import type { ReactNode } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { AdministrationDrawer } from "../administration-drawer";
import { StatusBadge, styles } from "../administration-ui";
import { formatStaffTime } from "./staff-presentation";

export function StaffShiftDrawer(props: {
  readonly item: ActiveShiftOverviewEntry;
  readonly location: ManagementLocation;
  readonly onClose: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const started = formatStaffTime(props.item.startedAt, props.location.timezone, locale);
  return (
    <AdministrationDrawer label={t.details} onClose={props.onClose}>
      <div className={styles.stack}>
        <Fact label={t.shift} value={t.activeShift} />
        <Fact label={t.status} value={<StatusBadge good>{t.active}</StatusBadge>} />
        <Fact label={t.location} value={props.location.name} />
        <Fact label={t.locationCode} value={<bdi dir="ltr">{props.location.code}</bdi>} />
        <Fact
          label={t.startedAt}
          value={<bdi dir={locale === "ar" ? "rtl" : "ltr"}>{started}</bdi>}
        />
        <Fact label={t.membership} value={<bdi dir="ltr">{props.item.membershipId}</bdi>} />
        <Fact label={t.shiftId} value={<bdi dir="ltr">{props.item.shiftId}</bdi>} />
      </div>
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
