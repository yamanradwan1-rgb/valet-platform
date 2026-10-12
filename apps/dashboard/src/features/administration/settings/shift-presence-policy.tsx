"use client";
import { presenceId } from "./shift-presence-id";

import { useState } from "react";
import {
  shiftPresenceCompanySetRequestSchema,
  shiftPresenceLocationSetRequestSchema,
  shiftPresenceLocationClearRequestSchema,
  shiftPresenceModeSchema,
} from "@valet/contracts";
import { styles } from "../administration-ui";
import type {
  PresenceApi,
  PresenceCompany,
  PresenceLocation,
} from "./shift-presence-api";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import type { PresenceCopyKey } from "./shift-presence-copy";
import { presenceCopy } from "./shift-presence-copy";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { presencePolicyHelpKeys } from "../../help/help-setting-manifest";
import { ScopedContextHelp } from "../../help/scoped-context-help";

import {
  presenceFields,
  parsePresenceField,
  presencePolicyContext,
  type Field,
} from "./shift-presence-policy-fields";

interface Props {
  readonly api: PresenceApi;
  readonly data: PresenceCompany | PresenceLocation;
  readonly locale: DashboardLocale;
  readonly mutation: PresenceMutation;
  readonly loading: boolean;
}
function PresencePolicyRow(props: Props & { readonly definition: Field }) {
  const t = presenceCopy(props.locale);
  const d = props.definition;
  const location = "overrides" in props.data ? props.data : null;
  const company =
    "policy" in props.data ? props.data.policy : props.data.company;
  const value = location ? location.effective[d.key] : company[d.key];
  const override = location ? location.overrides[d.override] : undefined;
  const context = presencePolicyContext(props.data);
  const contextKey = JSON.stringify(context);
  const [baseline, setBaseline] = useState({ key: contextKey, value, context });
  const [draft, setDraft] = useState(String(value));
  const [touched, setTouched] = useState(false);
  const changedContext = baseline.key !== contextKey;
  const parsed = parsePresenceField(d.field, draft);
  const invalid = parsed === null;
  const blocked =
    props.loading || props.mutation.blocked || !props.data.capabilities.canEdit;
  const changed =
    parsed !== value || (location && override === null && touched);
  const format = (input: string | number | null | undefined) =>
    typeof input === "string" &&
    shiftPresenceModeSchema.safeParse(input).success
      ? t(input as PresenceCopyKey)
      : input === null || input === undefined
        ? t("inherited")
        : String(input);
  async function submit(clear: boolean) {
    if (blocked || changedContext || (!clear && invalid)) return;
    const mutationId = presenceId();
    const body = clear
      ? shiftPresenceLocationClearRequestSchema.parse({
          ...context,
          mutationId,
          field: d.field,
        })
      : (location
          ? shiftPresenceLocationSetRequestSchema
          : shiftPresenceCompanySetRequestSchema
        ).parse({ ...context, mutationId, field: d.field, value: parsed });
    const result = await props.mutation.run(
      { mutationId, query: { kind: "POLICY" } },
      async () => ({
        kind: "POLICY",
        value: clear
          ? await props.api.clearPolicy(body)
          : await props.api.setPolicy(body),
      }),
    );
    if (result?.kind === "POLICY") {
      const savedContext = presencePolicyContext(result.value);
      const saved =
        "policy" in result.value
          ? result.value.policy[d.key]
          : result.value.effective[d.key];
      setBaseline({
        key: JSON.stringify(savedContext),
        value: saved,
        context: savedContext,
      });
      setDraft(String(saved));
      setTouched(false);
    }
  }
  const id = `presence-${d.field}`;
  return (
    <tr data-presence-field={d.field}>
      <td>
        <label className={styles.strong} htmlFor={id}>
          {t(d.label)}
        </label>
        <div className={styles.muted}>
          {t("savedValue")}: <bdi>{format(value)}</bdi>
        </div>
        {location ? (
          <>
            <div className={styles.muted}>
              {t("company")}: <bdi>{format(company[d.key])}</bdi>
            </div>
            <div className={styles.muted}>
              {t("override")}: <bdi>{format(override)}</bdi>
            </div>
            <div className={styles.muted}>
              {t("effective")}: <bdi>{format(value)}</bdi>
            </div>
            <div className={styles.muted}>
              {t("source")}: {t(override === null ? "inherited" : "overridden")}
            </div>
          </>
        ) : null}
      </td>
      <td>
        {typeof value === "string" ? (
          <select
            className={styles.select}
            id={id}
            aria-describedby={`${id}-help`}
            disabled={blocked}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setTouched(true);
            }}
          >
            {shiftPresenceModeSchema.options.map((mode) => (
              <option key={mode} value={mode}>
                {t(mode)}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={styles.input}
            id={id}
            dir="ltr"
            inputMode="numeric"
            aria-describedby={`${id}-help`}
            aria-invalid={invalid}
            disabled={blocked}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setTouched(true);
            }}
          />
        )}
        <p className={styles.muted} id={`${id}-help`}>
          {t(d.help)}
        </p>
        {invalid ? (
          <div className={styles.error} role="alert">
            {t("invalid")}
          </div>
        ) : null}
        {changedContext ? (
          <div className={styles.error} role="alert">
            <p>{t("conflict")}</p>
            <div>
              {t("previousValue")}: <bdi>{format(baseline.value)}</bdi>
            </div>
            <div>
              {t("currentValue")}: <bdi>{format(value)}</bdi>
            </div>
            <div>
              {t("draft")}: <bdi>{format(draft)}</bdi>
            </div>
            <button
              className={styles.secondary}
              disabled={blocked}
              onClick={() => {
                setBaseline({ key: contextKey, value, context });
                if (!touched) setDraft(String(value));
              }}
            >
              {t("reapply")}
            </button>
          </div>
        ) : null}
      </td>
      <td>
        <div className={styles.actions}>
          <button
            className={styles.primary}
            disabled={blocked || invalid || !changed || changedContext}
            onClick={() => void submit(false)}
          >
            {t("save")}
          </button>
          <ScopedContextHelp helpKey={presencePolicyHelpKeys[d.field]} />
          {location ? (
            <button
              className={styles.secondary}
              disabled={blocked || override === null || changedContext}
              onClick={() => void submit(true)}
            >
              {t("clear")}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function ShiftPresencePolicy(props: Props) {
  const t = presenceCopy(props.locale);
  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label={t("title")}
      tabIndex={0}
    >
      <table className={`${styles.table} ${styles.referenceTable}`}>
        <thead>
          <tr>
            <th>{t("title")}</th>
            <th>{t("effective")}</th>
            <th>{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {presenceFields.map((definition) => (
            <PresencePolicyRow
              {...props}
              definition={definition}
              key={definition.field}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
