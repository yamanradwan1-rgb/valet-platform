"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import type { SelectedDashboardScope } from "../../components/scope";
import { FocusDialog } from "../../components/presentation/focus-dialog";
import { managementAlertsEnabled } from "./alert-feature-gate";
import { alertBadge } from "./alert-model";
import { readManagementAlertsPreview } from "./alert-preview-api";
import { AlertPollOwner, type AlertPollState } from "./alert-poll-owner";
import { managementAlertsLocation } from "./alert-scope";
import { managementAlertCopy } from "./alert-copy";
import { subscribeAlertTimingChanges } from "./alert-timing-changes";
import { alertSourceHref } from "./alert-source-intent";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import "./management-alerts.css";

const unavailable: AlertPollState = { status: "unavailable", preview: null };

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
  const [state, setState] = useState<AlertPollState>(unavailable);
  const [open, setOpen] = useState(false);
  const owner = useRef<AlertPollOwner | null>(null);
  const liveScopeRevision = useSelectedScope().selectionRevision;
  const scopeRevisionRef = useRef(liveScopeRevision);
  useLayoutEffect(() => {
    scopeRevisionRef.current = liveScopeRevision;
  }, [liveScopeRevision]);
  const locationId = managementAlertsLocation(selectedScope);
  const organizationId = selectedScope.authority === "COMPANY_ADMIN"
    ? selectedScope.context.organization.organizationId
    : selectedScope.authority === "LOCATION_MANAGER"
      ? selectedScope.organization.organizationId : null;
  const identity = auth.identityGeneration;
  const session = auth.sessionGeneration;
  const authClient = auth.client;
  const allowed =
    managementAlertsEnabled && authorized && locationId !== null &&
    auth.status === "authenticated" && authClient.getStaffAuthSessionId() !== null;

  useEffect(() => {
    if (!allowed || locationId === null) return;
    let mounted = true;
    const currentAuthority = () =>
      mounted && authClient.getIdentityGeneration() === identity &&
      authClient.getSessionGeneration() === session &&
      scopeRevisionRef.current === selectionRevision &&
      authClient.getStaffAuthSessionId() !== null;
    const coordinator = new AlertPollOwner({
      load: (signal) => readManagementAlertsPreview(api, locationId, signal),
      currentAuthority,
      onState: (next) => {
        if (mounted) setState(next);
      },
    });
    owner.current = coordinator;
    const reconcileForeground = () => {
      coordinator.setForeground(
        document.visibilityState === "visible" && navigator.onLine &&
        currentAuthority(),
      );
    };
    document.addEventListener("visibilitychange", reconcileForeground);
    window.addEventListener("online", reconcileForeground);
    window.addEventListener("offline", reconcileForeground);
    window.addEventListener("focus", reconcileForeground);
    const unsubscribe = subscribeAlertTimingChanges((changedOrganization) => {
      if (changedOrganization === organizationId) coordinator.invalidatePreferences();
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
    allowed, api, authClient, identity, locationId, organizationId,
    selectionRevision, session,
  ]);

  if (!allowed) return null;
  const preview = state.status === "ready" ? state.preview : null;
  const badge = preview === null ? "—" : alertBadge(preview);
  const onSourceLink = (
    event: MouseEvent<HTMLAnchorElement>,
    item: NonNullable<typeof preview>["items"][number],
  ) => {
    if (
      event.button !== 0 || event.ctrlKey || event.metaKey ||
      event.shiftKey || event.altKey
    ) return;
    if (item.sourceKind === "PRESENCE" && window.location.pathname === "/policies") {
      event.preventDefault();
      // The already-mounted Studio owns section history and draft confirmation.
      window.history.pushState(window.history.state, "", alertSourceHref(item));
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className="management-alert-bell"
        aria-label={`${copy.title}: ${preview === null ? copy.unavailable : badge}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Bell size={18} aria-hidden="true" />
        <span className="management-alert-badge" aria-hidden="true">{badge}</span>
      </button>
      {open ? (
        <FocusDialog label={copy.title} onClose={() => setOpen(false)}>
          <div className="management-alert-panel" dir={locale === "ar" ? "rtl" : "ltr"}>
            <div className="management-alert-panel-heading">
              <h2>{copy.title}</h2>
              <button type="button" onClick={() => setOpen(false)}>{copy.close}</button>
            </div>
            {preview === null ? (
              <p role="status">{copy.unavailable}</p>
            ) : preview.items.length === 0 ? (
              <p role="status">{copy.none}</p>
            ) : (
              <ol className="management-alert-list">
                {preview.items.map((item) => (
                  <li key={item.id}>
                    <span className="management-alert-severity">
                      {item.severity === "CRITICAL" ? copy.critical : copy.important}
                    </span>
                    <bdi>{item.title}</bdi>
                    <small>{item.category}</small>
                    <Link
                      href={alertSourceHref(item)}
                      onClick={(event) => onSourceLink(event, item)}
                    >
                      {copy.details}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            <button
              type="button"
              onClick={() => void (state.status === "suspended"
                ? owner.current?.recover() : owner.current?.refresh())}
            >
              {state.status === "suspended" ? copy.retry : copy.refresh}
            </button>
          </div>
        </FocusDialog>
      ) : null}
    </>
  );
}
