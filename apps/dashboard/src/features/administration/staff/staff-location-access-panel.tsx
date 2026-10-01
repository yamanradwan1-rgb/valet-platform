"use client";

import type {
  StaffLocationAccessItem,
  StaffMembershipDetail,
} from "@valet/contracts";
import { useCallback, useState } from "react";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { administrationScopeKey } from "../administration-scope";
import { styles, StatusBadge } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import {
  changeStaffLocationAccess,
  readStaffLocationAccess,
} from "./staff-api";
import { StaffCursorControls } from "./staff-cursor-controls";
import { StaffLocationAssignmentDialog } from "./staff-location-assignment-dialog";

export function StaffLocationAccessPanel(props: {
  readonly api: DashboardApiClient;
  readonly authority: "COMPANY_ADMIN" | "LOCATION_MANAGER";
  readonly detail: StaffMembershipDetail;
  readonly onChanged: (detail: StaffMembershipDetail) => void;
  readonly onConflict: () => void;
  readonly organizationId: string;
  readonly reconciling: boolean;
}) {
  const dashboard = useProtectedDashboard();
  const scopeKey = administrationScopeKey(dashboard);
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<
    Map<string, StaffLocationAccessItem>
  >(new Map());
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const selectedIds = [...selected.keys()].sort();
  const load = useCallback(
    (signal: AbortSignal) =>
      readStaffLocationAccess(
        props.api,
        props.organizationId,
        props.detail.membershipId,
        cursor,
        signal,
      ),
    [props.api, props.organizationId, props.detail.membershipId, cursor],
  );
  const page = useAuthoritativeRead(
    `${scopeKey}:staff-grants:${props.detail.membershipId}:${cursor ?? "first"}`,
    load,
  );
  const refreshPage = page.refresh;
  const onConflict = props.onConflict;
  const reconcileConflict = useCallback(() => {
    setSelected(new Map());
    refreshPage();
    onConflict();
  }, [onConflict, refreshPage]);
  const mutation = useSensitiveMutation(
    `staff-location-revoke:${props.detail.membershipId}:${props.detail.version}:${selectedIds.join(",")}`,
    reconcileConflict,
  );

  function toggle(item: StaffLocationAccessItem) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.locationId)) next.delete(item.locationId);
      else if (next.size < 50) next.set(item.locationId, item);
      return next;
    });
  }

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <div>
          <h3 className={styles.sectionTitle}>{t.grants}</h3>
          <p className={styles.sectionText}>
            {props.detail.locationAccess.totalCount}
          </p>
        </div>
        <button
          className={styles.secondary}
          disabled={mutation.busy || props.reconciling || page.loading}
          onClick={() => setAssignmentOpen(true)}
          type="button"
        >
          {t.grantSelected}
        </button>
      </div>
      <div className={styles.stack}>
        {(page.data?.items ?? []).map((grant) => (
          <label className={styles.toolbar} key={grant.locationId}>
            <span>
              <span className={styles.strong}>
                <bdi dir="auto">{grant.name}</bdi>
              </span>
              <span className={styles.muted}>
                <bdi dir="ltr">{grant.code}</bdi>
              </span>
            </span>
            <span className={styles.actions}>
              <StatusBadge good={grant.status === "ACTIVE"}>
                {grant.status === "ACTIVE" ? t.active : t.inactive}
              </StatusBadge>
              <input
                checked={selected.has(grant.locationId)}
                disabled={
                  mutation.busy ||
                  props.reconciling ||
                  page.loading ||
                  (selectedIds.length >= 50 && !selected.has(grant.locationId))
                }
                onChange={() => toggle(grant)}
                type="checkbox"
              />
            </span>
          </label>
        ))}
      </div>
      <StaffCursorControls
        canNext={Boolean(page.data?.nextCursor)}
        canPrevious={history.length > 0}
        label={t.loadedCursorPage}
        loading={page.loading}
        locale={locale}
        onNext={() => {
          const next = page.data?.nextCursor;
          if (!next) return;
          setHistory((current) => [...current, cursor]);
          setCursor(next);
        }}
        onPrevious={() => {
          setCursor(history.at(-1) ?? null);
          setHistory((current) => current.slice(0, -1));
        }}
      />
      {selected.size > 0 ? (
        <div className={styles.stack} aria-live="polite">
          <div className={styles.sectionText}>
            {t.selectedLocations}: {selected.size}/50
          </div>
          {[...selected.values()].map((item) => (
            <div className={styles.muted} key={item.locationId}>
              <bdi dir="auto">{item.name}</bdi> ·{" "}
              <bdi dir="ltr">{item.code}</bdi>
            </div>
          ))}
        </div>
      ) : null}
      <div className={styles.actions}>
        <button
          className={styles.danger}
          disabled={
            mutation.busy ||
            props.reconciling ||
            page.loading ||
            selectedIds.length === 0 ||
            selectedIds.length > 50
          }
          onClick={() =>
            void mutation.run(
              () =>
                changeStaffLocationAccess(
                  props.api,
                  props.organizationId,
                  props.detail.membershipId,
                  selectedIds,
                  props.detail.version,
                  "revoke",
                ),
              (detail) => {
                setSelected(new Map());
                props.onChanged(detail);
                page.refresh();
              },
            )
          }
          type="button"
        >
          {t.revoke}
        </button>
      </div>
      {page.error ? (
        <div className={styles.error}>{String(page.error)}</div>
      ) : null}
      {mutation.error ? (
        <div className={styles.error} role="alert">
          {mutation.error}
        </div>
      ) : null}
      {assignmentOpen ? (
        <StaffLocationAssignmentDialog
          api={props.api}
          authority={props.authority}
          detail={props.detail}
          onChanged={(detail) => {
            setSelected(new Map());
            props.onChanged(detail);
            page.refresh();
          }}
          onClose={() => setAssignmentOpen(false)}
          onConflict={props.onConflict}
          organizationId={props.organizationId}
          reconciling={props.reconciling}
        />
      ) : null}
      {mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={props.api}
          onAssured={mutation.onMfaAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </div>
  );
}
