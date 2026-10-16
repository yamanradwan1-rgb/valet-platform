"use client";

import { styles } from "../administration-ui";
import { presenceCopy } from "./shift-presence-copy";
import { presencePolicyCopy } from "./shift-presence-policy-copy";
import { presenceFields, type Field } from "./shift-presence-policy-fields";
export type {
  PresencePolicyDraftState,
  PresencePolicyDrafts,
} from "./shift-presence-policy-fields";
import {
  ShiftPresencePolicyRow,
  type PolicyProps,
} from "./shift-presence-policy-row";
import policy from "./shift-presence-policy.module.css";

function PolicyTable({
  definitions,
  props,
}: {
  readonly definitions: readonly Field[];
  readonly props: PolicyProps;
}) {
  const t = presenceCopy(props.locale);
  return (
    <div className={styles.tableWrap} role="region" aria-label={t("title")} tabIndex={0}>
      <table className={`${styles.table} ${styles.referenceTable}`}>
        <thead>
          <tr>
            <th scope="col">{t("title")}</th>
            <th scope="col">{t("effective")}</th>
            <th scope="col">{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {definitions.map((definition) => (
            <ShiftPresencePolicyRow
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

/** Four independent server-backed fields; no aggregate save or unsaved effective projection. */
export function ShiftPresencePolicy(props: PolicyProps) {
  const t = presenceCopy(props.locale);
  const p = presencePolicyCopy(props.locale);
  const company = "policy" in props.data;
  const guided = props.mode === "GUIDED_SETUP";
  return (
    <section className={policy.policy} data-testid="shift-presence-policy">
      <div>
        <h3 className={policy.heading}>{p("modesHeading")}</h3>
        <p className={policy.intro}>{p("modesIntro")}</p>
        <p className={policy.intro}>{p(company ? "companyIntro" : "locationIntro")}</p>
        {guided ? <p className={policy.intro} role="status">{p("guidedIntro")}</p> : null}
      </div>
      <PolicyTable definitions={presenceFields.slice(0, 2)} props={props} />
      <details className={policy.advanced}>
        <summary>{p("advancedHeading")}</summary>
        <p className={policy.intro}>{p("advancedIntro")}</p>
        <PolicyTable definitions={presenceFields.slice(2)} props={props} />
      </details>
      <p className={policy.intro}>{t("modeHelp")}</p>
    </section>
  );
}
