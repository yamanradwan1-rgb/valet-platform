"use client";

import type {
  StaffLocationCandidate,
  StaffMembershipDetail,
} from "@valet/contracts";
import { useCallback, useState } from "react";

import { FocusDialog } from "../../../components/presentation/focus-dialog";
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
  readStaffLocationCandidates,
} from "./staff-api";
import { StaffCursorControls } from "./staff-cursor-controls";

export function StaffLocationAssignmentDialog(props: {
  readonly api: DashboardApiClient;
  readonly authority: "COMPANY_ADMIN" | "LOCATION_MANAGER";
  readonly detail: StaffMembershipDetail;
  readonly onChanged: (detail: StaffMembershipDetail) => void;
  readonly onClose: () => void;
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
  const [selected, setSelected] = useState<Map<string, StaffLocationCandidate>>(
    new Map(),
  );
  const selectedIds = [...selected.keys()].sort();
  const load = useCallback(
    (signal: AbortSignal) =>
      readStaffLocationCandidates(
        props.api,
        props.organizationId,
        props.detail.membershipId,
        cursor,
        signal,
      ),
    [props.api, props.organizationId, props.detail.membershipId, cursor],
  );
  const locations = useAuthoritativeRead(
    `${scopeKey}:staff-location-assignment:${props.detail.membershipId}:${cursor ?? "first"}`,
    load,
  );
  const refreshLocations = locations.refresh;
  const onConflict = props.onConflict;
  const reconcileConflict = useCallback(() => {
    setSelected(new Map());
    refreshLocations();
    onConflict();
  }, [onConflict, refreshLocations]);
  const mutation = useSensitiveMutation(
    `staff-location-grant:${props.detail.membershipId}:${props.detail.version}:${selectedIds.join(",")}`,
    reconcileConflict,
  );

  function toggle(item: StaffLocationCandidate) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.locationId)) next.delete(item.locationId);
      else if (next.size < 50) next.set(item.locationId, item);
      return next;
    });
  }

  return (
    <FocusDialog label={t.grants} onClose={props.onClose}>
      <div className={styles.stack}>
        <div>
          <h2 className={styles.dialogTitle}>{t.grants}</h2>
          <p className={styles.dialogSubtitle}>{t.grantSelected}</p>
        </div>
        <div className={`${styles.card} ${styles.cardPad}`}>
          <div className={styles.stack}>
            {(locations.data?.items ?? []).map((item) => {
              const unavailable =
                item.granted ||
                (props.authority === "LOCATION_MANAGER" &&
                  item.status !== "ACTIVE");
              return (
                <label className={styles.toolbar} key={item.locationId}>
                  <span>
                    <span className={styles.strong}>
                      <bdi dir="auto">{item.name}</bdi>
                    </span>
                    <span className={styles.muted}>
                      <bdi dir="ltr">{item.code}</bdi>
                    </span>
                  </span>
                  <span className={styles.actions}>
                    <StatusBadge good={item.status === "ACTIVE"}>
                      {item.status === "ACTIVE" ? t.active : t.inactive}
                    </StatusBadge>
                    <StatusBadge good={item.granted}>
                      {item.granted ? t.granted : t.notGranted}
                    </StatusBadge>
                    <input
                      checked={selected.has(item.locationId)}
                      disabled={
                        unavailable ||
                        mutation.busy ||
                        props.reconciling ||
                        locations.loading ||
                        (selectedIds.length >= 50 &&
                          !selected.has(item.locationId))
                      }
                      onChange={() => toggle(item)}
                      type="checkbox"
                    />
                  </span>
                </label>
              );
            })}
          </div>
          <StaffCursorControls
            canNext={Boolean(locations.data?.nextCursor)}
            canPrevious={history.length > 0}
            label={t.loadedCursorPage}
            loading={locations.loading}
            locale={locale}
            onNext={() => {
              const next = locations.data?.nextCursor;
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
        </div>
        {locations.error ? (
          <div className={styles.error} role="alert">
            {String(locations.error)}
          </div>
        ) : null}
        {mutation.error ? (
          <div className={styles.error} role="alert">
            {mutation.error}
          </div>
        ) : null}
        <div className={styles.formFooter}>
          <button
            className={styles.secondary}
            onClick={props.onClose}
            type="button"
          >
            {t.cancel}
          </button>
          <button
            className={styles.primary}
            disabled={
              mutation.busy ||
              props.reconciling ||
              locations.loading ||
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
                    "grant",
                  ),
                (detail) => {
                  props.onChanged(detail);
                  props.onClose();
                },
              )
            }
            type="button"
          >
            {t.grantSelected}
          </button>
        </div>
      </div>
      {mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={props.api}
          onAssured={mutation.onMfaAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </FocusDialog>
  );
}
