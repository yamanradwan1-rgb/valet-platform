"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { SensitiveMfaDialog } from "../administration/sensitive-mfa-dialog";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { useStudio } from "../administration/policies-studio/ui/studio-context";
import { managementAlertCopy, timingLabels } from "./alert-copy";
import { readAlertTimingPreferences, saveAlertTimingPreferences } from "./alert-timing-api";
import { announceAlertTimingChanged } from "./alert-timing-changes";
import { managementAlertsLocation } from "./alert-scope";
import {
  timingFields,
  validAlertTimingValues,
  type AlertTimingPreferences,
  type AlertTimingValues,
} from "./alert-timing-contract";
import "./management-alerts.css";

type TimingState = "loading" | "ready" | "saving" | "error" | "conflict";

export function AlertTimingPane() {
  const dashboard = useProtectedDashboard();
  const auth = useStaffAuth();
  const studio = useStudio();
  const copy = managementAlertCopy[studio.locale];
  const scope = dashboard.selectedScope;
  const organizationId = studio.route.org;
  const selectedOrganization = scope.authority === "COMPANY_ADMIN"
    ? scope.context.organization.organizationId
    : scope.authority === "LOCATION_MANAGER"
      ? scope.organization.organizationId : null;
  const locationId = selectedOrganization === organizationId
    ? managementAlertsLocation(scope) : null;
  const [saved, setSaved] = useState<AlertTimingPreferences | null>(null);
  const [draft, setDraft] = useState<AlertTimingValues | null>(null);
  const [status, setStatus] = useState<TimingState>("loading");
  const [notice, setNotice] = useState("");
  const [mfaOpen, setMfaOpen] = useState(false);
  const alive = useRef(true);
  const operation = useRef(0);
  const authorityKey = [
    dashboard.identityGeneration, dashboard.sessionGeneration,
    dashboard.selectionRevision, organizationId, locationId ?? "none",
  ].join(":");
  const currentAuthority = () =>
    alive.current && auth.client.getIdentityGeneration() === dashboard.identityGeneration &&
    auth.client.getSessionGeneration() === dashboard.sessionGeneration;

  useEffect(() => {
    alive.current = true;
    const request = ++operation.current;
    const controller = new AbortController();
    if (locationId !== null) {
      void readAlertTimingPreferences(
        dashboard.api, organizationId, locationId, controller.signal,
      ).then(
        (response) => {
          if (request !== operation.current || !currentAuthority()) return;
          setSaved(response);
          setDraft(response.values);
          setStatus("ready");
        },
        () => {
          if (request !== operation.current || !currentAuthority()) return;
          setStatus("error");
        },
      );
    }
    return () => {
      alive.current = false;
      operation.current += 1;
      controller.abort();
    };
    // Scope remounts on each auth/selection epoch; the key also retires an old read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.api, authorityKey]);

  function change(key: keyof AlertTimingValues, value: number) {
    if (status !== "ready" || draft === null) return;
    setDraft({ ...draft, [key]: value });
    studio.setDirty(true);
    setNotice("");
  }

  async function reload(): Promise<void> {
    if (locationId === null) return;
    const request = ++operation.current;
    setStatus("loading");
    try {
      const latest = await readAlertTimingPreferences(
        dashboard.api, organizationId, locationId,
      );
      if (request !== operation.current || !currentAuthority()) return;
      setSaved(latest);
      setDraft(latest.values);
      studio.setDirty(false);
      setNotice("");
      setStatus("ready");
    } catch {
      if (request === operation.current && currentAuthority()) setStatus("error");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (
      status !== "ready" || saved === null || draft === null ||
      !validAlertTimingValues(draft) || locationId === null
    )
      return;
    const request = ++operation.current;
    setStatus("saving");
    setNotice("");
    try {
      const current = await saveAlertTimingPreferences(
        dashboard.api, organizationId, locationId, saved.revision, draft,
      );
      if (request !== operation.current || !currentAuthority()) return;
      setSaved(current);
      setDraft(current.values);
      studio.setDirty(false);
      setStatus("ready");
      setNotice(copy.saved);
      announceAlertTimingChanged(organizationId);
    } catch (reason: unknown) {
      if (request !== operation.current || !currentAuthority()) return;
      if (reason instanceof DashboardApiError && reason.kind === "conflict") {
        setStatus("conflict");
      } else if (reason instanceof DashboardApiError && reason.kind === "mfa") {
        setStatus("ready");
        setMfaOpen(true);
        setNotice(copy.denied);
      } else {
        setStatus("error");
        setNotice(
          reason instanceof DashboardApiError &&
          ["auth", "authorization", "entitlement"].includes(reason.kind)
            ? copy.denied : copy.failed,
        );
      }
    }
  }

  if (locationId === null) return <p role="status">{copy.scope}</p>;
  return (
    <section className="management-alert-timing" aria-label={copy.heading}>
      <p>{copy.hint}</p>
      {status === "loading" ? <p role="status" aria-busy="true">{copy.loading}</p> : null}
      {status === "error" || status === "conflict" ? (
        <div role="alert">
          <p>{status === "conflict" ? copy.conflict : copy.failed}</p>
          <button type="button" onClick={() => void reload()}>{copy.reload}</button>
        </div>
      ) : null}
      {draft !== null && (status === "ready" || status === "saving") ? (
        <form onSubmit={(event) => void save(event)}>
          <div className="management-alert-timing-grid">
            {timingFields.map(({ key, min, max }) => (
              <label key={key}>
                <span>{timingLabels[key][studio.locale]}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={min}
                  max={max}
                  step={1}
                  dir="ltr"
                  value={Number.isNaN(draft[key]) ? "" : draft[key]}
                  aria-invalid={
                    !Number.isInteger(draft[key]) ||
                    draft[key] < min || draft[key] > max
                  }
                  onChange={(event) =>
                    change(
                      key,
                      event.currentTarget.value === ""
                        ? Number.NaN : event.currentTarget.valueAsNumber,
                    )
                  }
                  disabled={status === "saving"}
                />
                <small>{copy.unit}: {min}–{max}</small>
              </label>
            ))}
          </div>
          {!validAlertTimingValues(draft) ? (
            <p role="alert">{copy.invalid}</p>
          ) : null}
          <button
            type="submit"
            disabled={
              status === "saving" || !studio.dirty ||
              !validAlertTimingValues(draft)
            }
          >
            {status === "saving" ? copy.saving : copy.save}
          </button>
        </form>
      ) : null}
      <p role="status" aria-live="polite">{notice}</p>
      {mfaOpen ? (
        <SensitiveMfaDialog
          api={dashboard.api}
          onClose={() => setMfaOpen(false)}
          onAssured={() => {
            setMfaOpen(false);
            setNotice("");
          }}
        />
      ) : null}
    </section>
  );
}
