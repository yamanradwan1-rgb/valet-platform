"use client";

import { useEffect, useState } from "react";
import {
  shiftPresenceCompanySetRequestSchema,
  shiftPresenceLocationClearRequestSchema,
  shiftPresenceLocationSetRequestSchema,
  shiftPresenceModeSchema,
} from "@valet/contracts";
import { styles } from "../administration-ui";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import type { PresenceApi, PresenceCompany, PresenceLocation } from "./shift-presence-api";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import type { PresenceCopyKey } from "./shift-presence-copy";
import { presenceCopy } from "./shift-presence-copy";
import { presencePolicyCopy } from "./shift-presence-policy-copy";
import {
  requiresStrictPresenceConfirmation,
  parsePresenceField,
  presencePolicyFieldIdentity,
  presenceFieldSnapshot,
  presencePolicyContext,
  type Field,
  type PresencePolicyDraftState,
  type PresencePolicyDrafts,
} from "./shift-presence-policy-fields";
import { presencePolicyHelpKeys } from "../../help/help-setting-manifest";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { MobileSettingContextHelp } from "./mobile-setting-context-help";
import { presenceId } from "./shift-presence-id";
import policy from "./shift-presence-policy.module.css";

export interface PolicyProps {
  readonly api: PresenceApi;
  readonly data: PresenceCompany | PresenceLocation;
  readonly locale: DashboardLocale;
  readonly mutation: PresenceMutation;
  readonly loading: boolean;
  readonly drafts?: PresencePolicyDrafts;
  readonly onDraftChange?: (
    field: Field["field"],
    next: PresencePolicyDraftState | null,
  ) => void;
}

export function ShiftPresencePolicyRow(props: PolicyProps & { readonly definition: Field }) {
  const t = presenceCopy(props.locale);
  const p = presencePolicyCopy(props.locale);
  const field = props.definition;
  const { location, companyValue, effectiveValue, override } =
    presenceFieldSnapshot(props.data, field);
  const context = presencePolicyContext(props.data);
  const serverKey = presencePolicyFieldIdentity(context, effectiveValue, override);
  const fresh = (): PresencePolicyDraftState => ({
    draft: String(override ?? effectiveValue),
    touched: false,
    baselineKey: serverKey,
    baselineValue: effectiveValue,
    baselineOverride: override,
  });
  const [localDraft, setLocalDraft] = useState<PresencePolicyDraftState>(fresh);
  const onDraftChange = props.onDraftChange;
  const controlled = Boolean(props.drafts && onDraftChange);
  const state = controlled ? (props.drafts?.[field.field] ?? fresh()) : localDraft;
  const { draft, touched } = state;
  function updateDraft(next: PresencePolicyDraftState | null) {
    if (controlled) onDraftChange?.(field.field, next);
    else setLocalDraft(next ?? fresh());
  }
  const [confirmation, setConfirmation] = useState<"save" | "clear" | null>(null);

  // Keep pristine rows synchronized after another field's independent revision changes.
  // Dirty rows retain the user's unsaved input until explicit conflict review.
  useEffect(() => {
    if (state.baselineKey === serverKey || touched) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const next: PresencePolicyDraftState = {
        draft: String(override ?? effectiveValue),
        touched: false,
        baselineKey: serverKey,
        baselineValue: effectiveValue,
        baselineOverride: override,
      };
      if (controlled) onDraftChange?.(field.field, next);
      else setLocalDraft(next);
      setConfirmation(null);
    });
    return () => { cancelled = true; };
  }, [state.baselineKey, serverKey, touched, effectiveValue, override,
    controlled, onDraftChange, field.field]);

  const parsed = parsePresenceField(field.field, draft);
  const invalid = parsed === null;
  const conflict = state.baselineKey !== serverKey;
  const blocked = props.loading || props.mutation.blocked || !props.data.capabilities.canEdit;
  const dirty = touched && (parsed !== effectiveValue || (location !== null && override === null));
  const isMode = field.key === "startMode" || field.key === "endMode";
  const savedSource = location
    ? t(override === null ? "inherited" : "overridden")
    : t("company");
  const format = (input: string | number | null | undefined) =>
    typeof input === "string" && shiftPresenceModeSchema.safeParse(input).success
      ? t(input as PresenceCopyKey)
      : input === null || input === undefined ? t("inherited") : String(input);
  const requested = confirmation === "clear" ? companyValue : parsed;
  const consequence = isMode && parsed !== null
    ? p(parsed as "OFF" | "WARN_ONLY" | "REQUIRE" | "REQUIRE_OR_OVERRIDE")
    : p(field.key === "maxAccuracyMeters" ? "accuracyEffect" : "ageEffect");

  async function submit(clear: boolean) {
    if (blocked || conflict || (!clear && (invalid || !dirty)) || (clear && (!location || override === null)))
      return;
    const mutationId = presenceId();
    const body = clear
      ? shiftPresenceLocationClearRequestSchema.parse({
          ...context, mutationId, field: field.field,
        })
      : (location ? shiftPresenceLocationSetRequestSchema : shiftPresenceCompanySetRequestSchema)
          .parse({ ...context, mutationId, field: field.field, value: parsed });
    const result = await props.mutation.run(
      { mutationId, query: { kind: "POLICY" } },
      async () => ({
        kind: "POLICY",
        value: clear ? await props.api.clearPolicy(body) : await props.api.setPolicy(body),
      }),
    );
    if (result?.kind !== "POLICY") return;
    updateDraft(null);
    setConfirmation(null);
  }

  function request(action: "save" | "clear") {
    if (blocked || conflict) return;
    const value = action === "clear" ? companyValue : parsed;
    if (isMode && requiresStrictPresenceConfirmation(
      effectiveValue, value, action === "clear" && override !== null,
    )) {
      setConfirmation(action);
      return;
    }
    void submit(action === "clear");
  }

  const id = `presence-${field.field}`;
  return (
    <tr data-presence-field={field.field}>
      <td className={policy.field}>
        <MobileSettingContextHelp helpKey={presencePolicyHelpKeys[field.field]} />
        <label className={styles.strong} htmlFor={id}>{t(field.label)}</label>
        <div className={policy.status}>
          <span>{p("savedOnServer")}: <bdi><b>{format(effectiveValue)}</b></bdi></span>
          {location ? (
            <>
              <span>{t("company")}: <bdi>{format(companyValue)}</bdi></span>
              <span>{t("override")}: <bdi>{format(override)}</bdi></span>
            </>
          ) : null}
          <span>{t("source")}: <b>{savedSource}</b></span>
        </div>
      </td>
      <td>
        <div className={policy.fieldControl}>
          {isMode ? (
            <select
              className={styles.select}
              id={id}
              aria-describedby={`${id}-help ${id}-consequence`}
              disabled={blocked}
              value={draft}
              onChange={(event) => {
                updateDraft({ ...state, draft: event.target.value, touched: true });
                setConfirmation(null);
              }}
            >
              {shiftPresenceModeSchema.options.map((mode) => (
                <option key={mode} value={mode}>{t(mode)}</option>
              ))}
            </select>
          ) : (
            <input
              className={styles.input}
              id={id}
              dir="ltr"
              inputMode="numeric"
              aria-describedby={`${id}-help ${id}-consequence`}
              aria-invalid={invalid}
              disabled={blocked}
              value={draft}
              onChange={(event) => {
                updateDraft({ ...state, draft: event.target.value, touched: true });
                setConfirmation(null);
              }}
            />
          )}
          <span className={`${policy.draft} ${dirty ? policy.pending : ""}`} role="status">
            {dirty ? p("unsavedDraft") : p("matchesSaved")}: <bdi>{format(draft)}</bdi>
          </span>
        </div>
        <p className={`${styles.muted} ${policy.fieldHelp}`} id={`${id}-help`}>
          {t(field.help)}
          {location ? ` ${p(override === null ? "inheritedNote" : "explicitOverrideNote")}` : ""}
        </p>
        <p className={`${styles.muted} ${policy.fieldHelp}`} id={`${id}-consequence`}>
          {consequence}
        </p>
        {invalid ? <p className={styles.error} role="alert">{t("invalid")}</p> : null}
        {conflict && touched ? (
          <div className={styles.error} role="alert">
            <p>{t("conflict")}</p>
            <p>{t("previousValue")}: <bdi>{format(state.baselineValue)}</bdi></p>
            <p>{t("currentValue")}: <bdi>{format(effectiveValue)}</bdi></p>
            <p>{t("draft")}: <bdi>{format(draft)}</bdi></p>
            <button
              type="button"
              className={styles.secondary}
              disabled={blocked}
              onClick={() => {
                updateDraft({
                  ...state,
                  baselineKey: serverKey,
                  baselineValue: effectiveValue,
                  baselineOverride: override,
                });
                setConfirmation(null);
              }}
            >{t("reapply")}</button>
          </div>
        ) : null}
        {confirmation ? (
          <div className={policy.confirmation} role="group" aria-label={p("confirmStrict")}>
            <p><strong>{p("strictWarning")}</strong></p>
            {location ? null : <p>{p("strictCompany")}</p>}
            <p>{p("strictConfirmation")}</p>
            <p>{format(requested)}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.primary}
                disabled={blocked || conflict}
                onClick={() => void submit(confirmation === "clear")}>
                {p(confirmation === "clear" ? "confirmClear" : "confirmStrict")}
              </button>
              <button type="button" className={styles.secondary}
                onClick={() => setConfirmation(null)}>{t("cancel")}</button>
            </div>
          </div>
        ) : null}
      </td>
      <td>
        <div className={styles.actions}>
          <button type="button" className={styles.primary}
            disabled={blocked || conflict || invalid || !dirty || confirmation !== null}
            onClick={() => request("save")}>{t("save")}</button>
          <ScopedContextHelp helpKey={presencePolicyHelpKeys[field.field]} />
          {location ? (
            <button type="button" className={styles.secondary}
              disabled={blocked || conflict || override === null || confirmation !== null}
              onClick={() => request("clear")}>{t("clear")}</button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
