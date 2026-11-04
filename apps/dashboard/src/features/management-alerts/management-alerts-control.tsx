"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import {
  managementAlertUnifiedPreviewResponseSchema,
  type ManagementAlertUnifiedPreviewResponse,
} from "@valet/contracts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import type { SelectedDashboardScope } from "../../components/scope";
import { FocusDialog } from "../../components/presentation/focus-dialog";
import {
  managementAlertsEnabled,
  managementAlertsPhase23Enabled,
} from "./alert-feature-gate";
import {
  alertBadge,
  previewSchemaForLocation,
  type ManagementAlertPreview,
} from "./alert-model";
import { readManagementAlertsPreview } from "./alert-preview-api";
import { readUnifiedManagementAlertsPreview } from "./alert-unified-preview-api";
import { useUnifiedAlertActions } from "./alert-unified-actions";
import { UnifiedAlertList } from "./alert-unified-list";
import { readWithAlertTransportLease } from "./alert-read-lease";
import { AlertPollOwner, type AlertPollState } from "./alert-poll-owner";
import { managementAlertsLocation } from "./alert-scope";
import { managementAlertCopy } from "./alert-copy";
import { subscribeAlertTimingChanges } from "./alert-timing-changes";
import { alertSourceHref } from "./alert-source-intent";
import {
  isOrdinaryAlertSourceClick,
  navigateLegacyAlertSource,
} from "./alert-legacy-source-click";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import "./management-alerts.css";

type AlertPreview =
  ManagementAlertPreview | ManagementAlertUnifiedPreviewResponse;
const unavailable: AlertPollState<AlertPreview> = {
  status: "unavailable",
  preview: null,
};

export function ManagementAlertsControl({
  api,
  authorized,
  selectedScope,
  selectionRevision,
}: {
  readonly api: DashboardApiClient;
  readonly authorized: boolean;
  readonly selectedScope: SelectedDashboardScope;
  readonly selectionRevision: number;
}) {
  const auth = useStaffAuth();
  const { locale } = useDashboardLocale();
  const copy = managementAlertCopy[locale];
  const [state, setState] = useState<AlertPollState<AlertPreview>>(unavailable);
  const [open, setOpen] = useState(false);
  const [openEpoch, setOpenEpoch] = useState(0);
  const owner = useRef<AlertPollOwner<AlertPreview> | null>(null);
  const liveScopeRevision = useSelectedScope().selectionRevision;
  const scopeRevisionRef = useRef(liveScopeRevision);
  useLayoutEffect(() => {
    scopeRevisionRef.current = liveScopeRevision;
  }, [liveScopeRevision]);
  const locationId = managementAlertsLocation(selectedScope);
  const organizationId =
    selectedScope.authority === "COMPANY_ADMIN"
      ? selectedScope.context.organization.organizationId
      : selectedScope.authority === "LOCATION_MANAGER"
        ? selectedScope.organization.organizationId
        : null;
  const identity = auth.identityGeneration;
  const session = auth.sessionGeneration;
  const authClient = auth.client;
  const allowed =
    managementAlertsEnabled &&
    authorized &&
    locationId !== null &&
    auth.status === "authenticated" &&
    authClient.getStaffAuthSessionId() !== null;
  const stillCurrent = () =>
    allowed &&
    authClient.getIdentityGeneration() === identity &&
    authClient.getSessionGeneration() === session &&
    scopeRevisionRef.current === selectionRevision &&
    authClient.getStaffAuthSessionId() !== null;
  const actions = useUnifiedAlertActions({
    api,
    locationId,
    isCurrentAuthority: stillCurrent,
    scopeKey: [
      identity,
      session,
      selectionRevision,
      locationId,
      openEpoch,
    ].join(":"),
    panelOpen: open,
    onServerConfirmedSeen: () => owner.current?.invalidatePreferences(),
  });
  const closePanel = () => {
    actions.cancelPending();
    setOpen(false);
  };

  useEffect(() => {
    if (!allowed || locationId === null) return;
    let mounted = true;
    const currentAuthority = () =>
      mounted &&
      authClient.getIdentityGeneration() === identity &&
      authClient.getSessionGeneration() === session &&
      scopeRevisionRef.current === selectionRevision &&
      authClient.getStaffAuthSessionId() !== null;
    const coordinator = new AlertPollOwner<AlertPreview>({
      load: (signal) =>
        readWithAlertTransportLease<AlertPreview>(
          signal,
          currentAuthority,
          (activeSignal) =>
            managementAlertsPhase23Enabled
              ? readUnifiedManagementAlertsPreview(
                  api,
                  locationId,
                  selectedScope.authority === "COMPANY_ADMIN",
                  activeSignal,
                  currentAuthority,
                )
              : readManagementAlertsPreview(
                  api,
                  locationId,
                  activeSignal,
                  currentAuthority,
                ),
        ),
      currentAuthority,
      onState: (next) => {
        if (mounted) setState(next);
      },
    });
    owner.current = coordinator;
    const reconcileForeground = () => {
      coordinator.setForeground(
        document.visibilityState === "visible" &&
          navigator.onLine &&
          currentAuthority(),
      );
    };
    document.addEventListener("visibilitychange", reconcileForeground);
    window.addEventListener("online", reconcileForeground);
    window.addEventListener("offline", reconcileForeground);
    window.addEventListener("focus", reconcileForeground);
    const unsubscribe = subscribeAlertTimingChanges((changedOrganization) => {
      if (changedOrganization === organizationId)
        coordinator.invalidatePreferences();
    });
    queueMicrotask(() => {
      if (mounted) reconcileForeground();
    });
    return () => {
      mounted = false;
      owner.current = null;
      coordinator.dispose();
      document.removeEventListener("visibilitychange", reconcileForeground);
      window.removeEventListener("online", reconcileForeground);
      window.removeEventListener("offline", reconcileForeground);
      window.removeEventListener("focus", reconcileForeground);
      unsubscribe();
    };
  }, [
    allowed,
    api,
    authClient,
    identity,
    locationId,
    organizationId,
    selectionRevision,
    session,
    selectedScope.authority,
  ]);

  if (!allowed) return null;
  const preview = state.status === "ready" ? state.preview : null;
  const unifiedResult =
    managementAlertsPhase23Enabled && preview !== null
      ? managementAlertUnifiedPreviewResponseSchema.safeParse(preview)
      : null;
  const legacyResult =
    !managementAlertsPhase23Enabled && preview !== null && locationId !== null
      ? previewSchemaForLocation(locationId).safeParse(preview)
      : null;
  const unified = unifiedResult?.success ? unifiedResult.data : null;
  const legacy = legacyResult?.success ? legacyResult.data : null;
  const badge =
    preview === null || (unified === null && legacy === null)
      ? "—"
      : alertBadge(preview);
  return (
    <>
      <button
        type="button"
        className="management-alert-bell"
        aria-label={`${copy.title}: ${preview === null ? copy.unavailable : badge}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpenEpoch((value) => value + 1);
          setOpen(true);
        }}
      >
        <Bell size={18} aria-hidden="true" />
        <span className="management-alert-badge" aria-hidden="true">
          {badge}
        </span>
      </button>
      {open ? (
        <FocusDialog label={copy.title} onClose={closePanel}>
          <div
            className={
              managementAlertsPhase23Enabled
                ? "management-alert-panel management-alert-panel--unified"
                : "management-alert-panel"
            }
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="management-alert-panel-heading">
              <h2>{copy.title}</h2>
              <button type="button" onClick={closePanel}>
                {copy.close}
              </button>
            </div>
            {preview === null || (unified === null && legacy === null) ? (
              <p role="status">{copy.unavailable}</p>
            ) : (unified?.items.length ?? legacy?.items.length) === 0 ? (
              <p role="status">{copy.none}</p>
            ) : unified !== null ? (
              <UnifiedAlertList
                items={unified.items}
                locale={locale}
                {...actions}
              />
            ) : (
              <ol className="management-alert-list">
                {legacy?.items.map((item) => (
                  <li key={item.id}>
                    <span className="management-alert-severity">
                      {item.severity === "CRITICAL"
                        ? copy.critical
                        : copy.important}
                    </span>
                    <bdi>{item.title}</bdi>
                    <small>{item.category}</small>
                    <Link
                      href={alertSourceHref(item)}
                      onClick={(event) => {
                        if (!isOrdinaryAlertSourceClick(event)) return;
                        navigateLegacyAlertSource(event, item);
                        closePanel();
                      }}
                    >
                      {copy.details}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            <button
              type="button"
              onClick={() =>
                void (state.status === "suspended"
                  ? owner.current?.recover()
                  : owner.current?.refresh())
              }
            >
              {state.status === "suspended" ? copy.retry : copy.refresh}
            </button>
          </div>
        </FocusDialog>
      ) : null}
    </>
  );
}
