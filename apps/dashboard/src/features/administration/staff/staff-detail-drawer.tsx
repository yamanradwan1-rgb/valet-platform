"use client";

import type { StaffManagementRole, StaffMembershipDetail } from "@valet/contracts";
import { useState } from "react";

import { AdministrationDrawer } from "../administration-drawer";
import { administrationCopy } from "../administration-copy";
import { styles, StatusBadge } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { changeStaffLocationAccess, setStaffRole, setStaffStatus } from "./staff-api";
import { staffRoleLabel, staffStatusLabel } from "./staff-labels";

const roles: readonly StaffManagementRole[] = [
  "ORG_ADMIN", "LOCATION_MANAGER", "VALET_SUPERVISOR", "VALET_EMPLOYEE",
];

export function StaffDetailDrawer(props: {
  readonly api: DashboardApiClient;
  readonly detail: StaffMembershipDetail;
  readonly onChanged: (detail: StaffMembershipDetail) => void;
  readonly onClose: () => void;
  readonly onConflict: () => void;
  readonly organizationId: string;
  readonly selectedLocationId: string | null;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const [role, setRole] = useState<StaffManagementRole>(props.detail.role);
  const mutation = useSensitiveMutation(
    `staff:${props.detail.membershipId}:${props.detail.version}`,
    props.onConflict,
  );

  const selectedGranted = props.selectedLocationId !== null &&
    props.detail.locationAccess.items.some((item) => item.locationId === props.selectedLocationId);
  return (
    <AdministrationDrawer label={t.details} onClose={props.onClose}>
      <div className={styles.stack}>
        <div><div className={styles.muted}>{t.email}</div><bdi className={styles.strong} dir="ltr">{props.detail.identity.email}</bdi></div>
        <div className={styles.grid2}>
          <div><div className={styles.muted}>{t.status}</div><StatusBadge good={props.detail.status === "ACTIVE"}>{staffStatusLabel(props.detail.status, t)}</StatusBadge></div>
          <div><div className={styles.muted}>{t.version}</div><bdi dir="ltr">{props.detail.version}</bdi></div>
        </div>
        <div className={styles.field}>
          <label htmlFor="staff-role">{t.role}</label>
          <div className={styles.actions}>
            <select className={styles.select} id="staff-role" onChange={(event) => setRole(event.target.value as StaffManagementRole)} value={role}>
              {roles.map((item) => <option key={item} value={item}>{staffRoleLabel(item, t)}</option>)}
            </select>
            <button className={styles.primary} disabled={mutation.busy || role === props.detail.role} onClick={() => void mutation.run(() => setStaffRole(props.api, props.organizationId, props.detail.membershipId, role, props.detail.version), props.onChanged)} type="button">{t.save}</button>
          </div>
        </div>
        <div className={styles.actions}>
          {props.detail.status === "ACTIVE" ? (
            <button className={styles.danger} disabled={mutation.busy} onClick={() => void mutation.run(() => setStaffStatus(props.api, props.organizationId, props.detail.membershipId, "INACTIVE", props.detail.version), props.onChanged)} type="button">{t.deactivateStaff}</button>
          ) : (
            <button className={styles.primary} disabled={mutation.busy} onClick={() => void mutation.run(() => setStaffStatus(props.api, props.organizationId, props.detail.membershipId, "ACTIVE", props.detail.version), props.onChanged)} type="button">{t.activateStaff}</button>
          )}
          {props.selectedLocationId && !selectedGranted && !props.detail.locationAccess.truncated ? (
            <button className={styles.secondary} disabled={mutation.busy} onClick={() => void mutation.run(() => changeStaffLocationAccess(props.api, props.organizationId, props.detail.membershipId, props.selectedLocationId!, props.detail.version, "grant"), props.onChanged)} type="button">{t.grantSelected}</button>
          ) : null}
        </div>
        <div>
          <h3 className={styles.sectionTitle}>{t.grants}</h3>
          <p className={styles.sectionText}>{props.detail.locationAccess.totalCount}{props.detail.locationAccess.truncated ? ` · ${t.grantListTruncated}` : ""}</p>
        </div>
        <div className={styles.stack}>
          {props.detail.locationAccess.items.map((grant) => (
            <div className={styles.toolbar} key={grant.locationId}>
              <div><div className={styles.strong}>{grant.name}</div><bdi className={styles.muted} dir="ltr">{grant.locationId}</bdi></div>
              <button className={styles.danger} disabled={mutation.busy} onClick={() => void mutation.run(() => changeStaffLocationAccess(props.api, props.organizationId, props.detail.membershipId, grant.locationId, props.detail.version, "revoke"), props.onChanged)} type="button">{t.revoke}</button>
            </div>
          ))}
        </div>
        {mutation.error ? <div className={styles.error} role="alert">{mutation.error}</div> : null}
      </div>
      {mutation.mfaOpen ? <SensitiveMfaDialog api={props.api} onAssured={mutation.onMfaAssured} onClose={mutation.closeMfa} /> : null}
    </AdministrationDrawer>
  );
}
