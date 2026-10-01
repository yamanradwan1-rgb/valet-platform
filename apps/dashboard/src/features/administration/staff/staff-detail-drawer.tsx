"use client";

import type {
  StaffManagementRole,
  StaffMembershipDetail,
} from "@valet/contracts";
import { staffManagementDisplayName } from "@valet/contracts";
import { useState } from "react";

import { AdministrationDrawer } from "../administration-drawer";
import { administrationCopy } from "../administration-copy";
import { styles, StatusBadge } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { setStaffRole, setStaffStatus } from "./staff-api";
import { staffRoleLabel, staffStatusLabel } from "./staff-labels";
import { StaffLocationAccessPanel } from "./staff-location-access-panel";

const roles: readonly StaffManagementRole[] = [
  "ORG_ADMIN",
  "LOCATION_MANAGER",
  "VALET_SUPERVISOR",
  "VALET_EMPLOYEE",
];
const locationManagerRoles: readonly StaffManagementRole[] = [
  "VALET_SUPERVISOR",
  "VALET_EMPLOYEE",
];

export function StaffDetailDrawer(props: {
  readonly api: DashboardApiClient;
  readonly authority: "COMPANY_ADMIN" | "LOCATION_MANAGER";
  readonly detail: StaffMembershipDetail;
  readonly onChanged: (detail: StaffMembershipDetail) => void;
  readonly onClose: () => void;
  readonly onConflict: () => void;
  readonly organizationId: string;
  readonly reconciling: boolean;
  readonly selectedLocationId: string | null;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const [role, setRole] = useState<StaffManagementRole>(props.detail.role);
  const mutation = useSensitiveMutation(
    `staff:${props.detail.membershipId}:${props.detail.version}`,
    props.onConflict,
  );

  return (
    <AdministrationDrawer label={t.details} onClose={props.onClose}>
      <div className={styles.stack}>
        <div>
          <div className={styles.muted}>{t.name}</div>
          <bdi
            className={styles.strong}
            dir={
              props.detail.identity.firstName !== null &&
              props.detail.identity.lastName !== null
                ? "auto"
                : "ltr"
            }
          >
            {staffManagementDisplayName(props.detail.identity)}
          </bdi>
          {props.detail.identity.firstName !== null &&
          props.detail.identity.lastName !== null ? (
            <div className={styles.muted}>
              <bdi dir="ltr">{props.detail.identity.email}</bdi>
            </div>
          ) : null}
        </div>
        <div className={styles.grid2}>
          <div>
            <div className={styles.muted}>{t.status}</div>
            <StatusBadge good={props.detail.status === "ACTIVE"}>
              {staffStatusLabel(props.detail.status, t)}
            </StatusBadge>
          </div>
          <div>
            <div className={styles.muted}>{t.version}</div>
            <bdi dir="ltr">{props.detail.version}</bdi>
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="staff-role">{t.role}</label>
          <div className={styles.actions}>
            <select
              className={styles.select}
              id="staff-role"
              onChange={(event) =>
                setRole(event.target.value as StaffManagementRole)
              }
              value={role}
            >
              {(props.authority === "LOCATION_MANAGER"
                ? locationManagerRoles
                : roles
              ).map((item) => (
                <option key={item} value={item}>
                  {staffRoleLabel(item, t)}
                </option>
              ))}
            </select>
            <button
              className={styles.primary}
              disabled={
                mutation.busy || props.reconciling || role === props.detail.role
              }
              onClick={() =>
                void mutation.run(
                  () =>
                    setStaffRole(
                      props.api,
                      props.organizationId,
                      props.detail.membershipId,
                      role,
                      props.detail.version,
                    ),
                  props.onChanged,
                )
              }
              type="button"
            >
              {t.save}
            </button>
          </div>
        </div>
        <div className={styles.actions}>
          {props.detail.status === "ACTIVE" ? (
            <button
              className={styles.danger}
              disabled={mutation.busy || props.reconciling}
              onClick={() =>
                void mutation.run(
                  () =>
                    setStaffStatus(
                      props.api,
                      props.organizationId,
                      props.detail.membershipId,
                      "INACTIVE",
                      props.detail.version,
                    ),
                  props.onChanged,
                )
              }
              type="button"
            >
              {t.deactivateStaff}
            </button>
          ) : (
            <button
              className={styles.primary}
              disabled={mutation.busy || props.reconciling}
              onClick={() =>
                void mutation.run(
                  () =>
                    setStaffStatus(
                      props.api,
                      props.organizationId,
                      props.detail.membershipId,
                      "ACTIVE",
                      props.detail.version,
                    ),
                  props.onChanged,
                )
              }
              type="button"
            >
              {t.activateStaff}
            </button>
          )}
        </div>
        <StaffLocationAccessPanel
          api={props.api}
          authority={props.authority}
          detail={props.detail}
          onChanged={props.onChanged}
          onConflict={props.onConflict}
          organizationId={props.organizationId}
          reconciling={props.reconciling}
        />
        {mutation.error ? (
          <div className={styles.error} role="alert">
            {mutation.error}
          </div>
        ) : null}
      </div>
      {mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={props.api}
          onAssured={mutation.onMfaAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </AdministrationDrawer>
  );
}
