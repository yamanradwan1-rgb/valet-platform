"use client";
import { presenceId } from "./shift-presence-id";

import { useLayoutEffect, useRef, useState } from "react";
import { type ShiftPresenceZone } from "@valet/contracts";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { useDashboardTheme } from "../../../lib/theme/theme-provider";
import { styles } from "../administration-ui";
import { presenceCopy, type PresenceCopyKey } from "./shift-presence-copy";
import {
  parseZoneDraft,
  zoneDraft,
  draftCenter,
  type ZoneDraft,
} from "./shift-presence-zone-draft";
import { useAttendanceZoneLocation } from "./use-attendance-zone-location";
import { AttendanceZoneMap } from "./attendance-zone-map";
import type { PresenceApi } from "./shift-presence-api";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import feature from "./shift-presence.module.css";
import { usePresenceDialogFocus } from "./use-presence-dialog-focus";
import { PresenceMutationFeedback } from "./shift-presence-feedback";
import { ScopedContextHelp } from "../../help/scoped-context-help";

const fields = [
  { key: "label", label: "label", help: "labelHelp", max: 200 },
  { key: "code", label: "code", help: "codeHelp", max: 64 },
  { key: "latitude", label: "latitude", help: "latitudeHelp" },
  { key: "longitude", label: "longitude", help: "longitudeHelp" },
  { key: "radiusMeters", label: "radius", help: "radiusHelp" },
] as const;
export function ShiftPresenceZoneForm(props: {
  readonly zone: ShiftPresenceZone | null;
  readonly zoneId: string;
  readonly mode: "edit" | "enable" | "disable";
  readonly api: PresenceApi;
  readonly mutation: PresenceMutation;
  readonly locale: DashboardLocale;
  readonly disabled: boolean;
  readonly onClose: () => void;
}) {
  const t = presenceCopy(props.locale);
  const { theme } = useDashboardTheme();
  const canonical = props.mutation.canonical;
  const currentZone =
    canonical?.kind === "ZONE" &&
    canonical.value.zone?.id === props.zoneId &&
    canonical.value.zone.revision >= (props.zone?.revision ?? 0)
      ? canonical.value.zone
      : props.zone;
  const [baseline, setBaseline] = useState(props.zone);
  const [draft, setDraft] = useState<ZoneDraft>(() => ({
    ...zoneDraft(props.zone ?? undefined),
    ...(props.mode === "enable"
      ? { state: "ACTIVE" }
      : props.mode === "disable"
        ? { state: "DISABLED" }
        : {}),
  }));
  const form = useRef<HTMLFormElement>(null);
  usePresenceDialogFocus(form, props.disabled);
  const first = useRef<HTMLInputElement>(null);
  const busyRef = useRef(props.disabled);
  useLayoutEffect(() => {
    busyRef.current = props.disabled;
  }, [props.disabled]);
  useLayoutEffect(() => {
    first.current?.focus();
  }, []);
  const location = useAttendanceZoneLocation((center) => {
    if (!busyRef.current)
      setDraft((value) => ({
        ...value,
        latitude: String(center.lat),
        longitude: String(center.lng),
      }));
  });
  const parsed = parseZoneDraft(draft);
  const invalidKeys = parsed.success
    ? []
    : parsed.error.issues.map((issue) => String(issue.path[0]));
  const conflict =
    currentZone !== null &&
    baseline !== null &&
    currentZone.revision !== baseline.revision;
  const changed =
    parsed.success &&
    (!currentZone ||
      Object.entries(parsed.data).some(
        ([key, value]) => currentZone[key as keyof ShiftPresenceZone] !== value,
      ));
  const blocked = props.disabled;
  function edit(key: keyof ZoneDraft, value: string) {
    location.retire(key === "latitude" || key === "longitude");
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function submit() {
    if (!parsed.success) {
      form.current
        ?.querySelector<HTMLElement>(`[name="${invalidKeys[0]}"]`)
        ?.focus();
      return;
    }
    if (blocked || conflict || !changed) return;
    location.retire();
    const mutationId = presenceId();
    const create = currentZone === null;
    const body = {
      ...parsed.data,
      mutationId,
      ...(create
        ? { zoneId: props.zoneId }
        : { expectedRevision: currentZone.revision }),
    };
    const committed = await props.mutation.run(
      { mutationId, create, query: { kind: "ZONE", entityId: props.zoneId } },
      async () => ({
        kind: "ZONE",
        value: await props.api.saveZone(props.zoneId, body, create),
      }),
    );
    if (committed) props.onClose();
  }
  const center = draftCenter(draft);
  const radius = draft.radiusMeters.trim() ? Number(draft.radiusMeters) : NaN;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      ref={form}
      noValidate
    >
      <div className={feature.dialogBody}>
        <PresenceMutationFeedback
          mutation={props.mutation}
          locale={props.locale}
        />
        {props.mode === "disable" ? (
          <p className={styles.muted}>
            {t("disableWarning")} <b>{currentZone?.label}</b>
          </p>
        ) : null}
        <div className={styles.grid2}>
          {fields.map((field) => (
            <div className={styles.field} key={field.key}>
              <label htmlFor={`zone-${field.key}`}>{t(field.label)}</label>
              <input
                className={styles.input}
                id={`zone-${field.key}`}
                name={field.key}
                ref={field.key === "label" ? first : undefined}
                dir={field.key === "label" ? undefined : "ltr"}
                inputMode={
                  field.key === "label" || field.key === "code"
                    ? "text"
                    : "decimal"
                }
                maxLength={"max" in field ? field.max : undefined}
                aria-describedby={`zone-${field.key}-help`}
                aria-invalid={invalidKeys.includes(field.key)}
                disabled={blocked || props.mode !== "edit"}
                value={draft[field.key]}
                onChange={(event) => edit(field.key, event.target.value)}
              />
              <span className={styles.muted} id={`zone-${field.key}-help`}>
                {t(field.help)}
              </span>
            </div>
          ))}
          <div className={styles.field}>
            <label htmlFor="zone-state">{t("status")}</label>
            <select
              className={styles.select}
              id="zone-state"
              name="state"
              disabled={blocked || props.mode !== "edit"}
              aria-invalid={invalidKeys.includes("state")}
              value={draft.state}
              onChange={(event) => edit("state", event.target.value)}
            >
              <option value="">{t("statePrompt")}</option>
              <option value="ACTIVE">{t("ACTIVE")}</option>
              <option value="DISABLED">{t("DISABLED")}</option>
            </select>
          </div>
        </div>
        {!parsed.success ? (
          <div className={styles.error} role="alert">
            {t("invalid")}
          </div>
        ) : null}
        {props.mode === "edit" ? (
          <>
            <div>
              <button
                className={styles.secondary}
                type="button"
                disabled={blocked || location.locating}
                onClick={location.locate}
              >
                {t("currentLocation")}
              </button>
              <p className={styles.muted}>{t("locationHint")}</p>
              {location.locating ? <p role="status">{t("locating")}</p> : null}
              {location.accuracy !== null ? (
                <p className={styles.muted} role="status">
                  {t("locationAccuracy")}:{" "}
                  <bdi dir="ltr">±{location.accuracy} m</bdi>
                </p>
              ) : null}
              {location.message ? (
                <p className={styles.error} role="alert">
                  {t(location.message)}
                </p>
              ) : null}
            </div>
            <AttendanceZoneMap
              center={center}
              radius={
                Number.isFinite(radius) && radius >= 5 && radius <= 1000
                  ? radius
                  : null
              }
              locale={props.locale}
              theme={theme}
              disabled={blocked}
              onCenter={(point) => {
                location.retire();
                setDraft((value) => ({
                  ...value,
                  latitude: String(point.lat),
                  longitude: String(point.lng),
                }));
              }}
            />
          </>
        ) : null}
        {conflict ? (
          <div className={`${styles.error} ${feature.comparison}`} role="alert">
            <p>{t("conflict")}</p>
            {[
              {
                label: "previousValue",
                value: zoneDraft(baseline ?? undefined),
              },
              {
                label: "currentValue",
                value: zoneDraft(currentZone ?? undefined),
              },
              { label: "draft", value: draft },
            ].map((item) => (
              <p key={item.label}>
                {t(item.label as PresenceCopyKey)}:{" "}
                <bdi dir="ltr">{Object.values(item.value).join(" · ")}</bdi>
              </p>
            ))}
            <button
              className={styles.secondary}
              type="button"
              disabled={blocked}
              onClick={() => setBaseline(currentZone)}
            >
              {t("reapply")}
            </button>
          </div>
        ) : null}
      </div>
      <div className={styles.formFooter}>
        <button
          className={styles.secondary}
          type="button"
          onClick={props.onClose}
        >
          {t("cancel")}
        </button>
        <button
          className={styles.primary}
          disabled={blocked || !parsed.success || !changed || conflict}
          type="submit"
        >
          {t(props.mode === "edit" ? "save" : props.mode)}
        </button>
        <ScopedContextHelp helpKey="presence.zoneForm" />
      </div>
    </form>
  );
}
