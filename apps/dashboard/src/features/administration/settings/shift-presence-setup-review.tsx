import type { DashboardLocale } from "../../../lib/i18n/locale";
import { styles } from "../administration-ui";
import type { PresenceLocation } from "./shift-presence-api";
import { presenceCopy } from "./shift-presence-copy";
import { presenceFields, parsePresenceField, type Field } from "./shift-presence-policy-fields";
import type { PresenceMutation } from "./use-shift-presence-mutation";

export interface PresencePolicyDraftState {
  readonly draft: string;
  readonly touched: boolean;
  readonly baselineKey: string;
  readonly baselineValue: string | number;
  readonly baselineOverride: string | number | null | undefined;
}

export type PresencePolicyDrafts = Partial<
  Record<Field["field"], PresencePolicyDraftState>
>;

/** Review is read-only: saved data is never replaced by a proposed draft. */
export function ShiftPresenceSetupReview(props: {
  readonly locale: DashboardLocale;
  readonly data: PresenceLocation;
  readonly drafts: PresencePolicyDrafts;
  readonly mutation: PresenceMutation;
  readonly onOverview: () => void;
}) {
  const t = presenceCopy(props.locale);
  const ar = props.locale === "ar";
  return (
    <div data-testid="presence-setup-review">
      <p className={styles.sectionText}>
        {ar
          ? "هذه حالة الخادم المحفوظة. أي مسودات مقترحة أدناه غير محفوظة ولا توجد عملية حفظ موحدة أو إتمام إعداد دائم."
          : "These are server-saved settings. Proposed drafts below are not saved; there is no aggregate Save or persisted setup completion."}
      </p>
      <div className={styles.cardPad}>
        <h3 className={styles.sectionTitle}>{ar ? "المحفوظ مقابل المقترح" : "Saved vs proposed"}</h3>
        <div className={styles.tableWrap} role="region" aria-label={ar ? "مراجعة السياسة" : "Policy review"} tabIndex={0}>
          <table className={`${styles.table} ${styles.referenceTable}`}>
            <thead>
              <tr>
                <th scope="col">{t("title")}</th>
                <th scope="col">{t("savedValue")}</th>
                <th scope="col">{t("draft")}</th>
              </tr>
            </thead>
            <tbody>
              {presenceFields.map((field) => {
                const saved = props.data.effective[field.key];
                const override = props.data.overrides[field.override];
                const proposed = props.drafts[field.field];
                const parsed = proposed ? parsePresenceField(field.field, proposed.draft) : null;
                const dirty = proposed?.touched &&
                  (parsed !== saved || (override === null && proposed.touched));
                const printable = (value: string | number) =>
                  value === "OFF" || value === "WARN_ONLY" ||
                  value === "REQUIRE" || value === "REQUIRE_OR_OVERRIDE"
                    ? t(value)
                    : String(value);
                return (
                  <tr key={field.field}>
                    <th scope="row">{t(field.label)}</th>
                    <td><bdi>{printable(saved)}</bdi> · {t(override === null ? "inherited" : "overridden")}</td>
                    <td>
                      {dirty && proposed ? (
                        <span><bdi>{proposed.draft}</bdi> — {ar ? "مسودة غير محفوظة" : "Unsaved draft"}</span>
                      ) : (ar ? "لا تغيير مقترح" : "No proposed change")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {props.mutation.pending ? (
          <p className={styles.error} role="alert">
            {t("unknown")}{" "}
            {ar ? "معرّف التغيير المعلّق" : "Unresolved mutation ID"}:{" "}
            <bdi dir="ltr">{props.mutation.pending.mutationId}</bdi> ({props.mutation.pending.query.kind})
          </p>
        ) : (
          <p className={styles.muted}>
            {ar
              ? "تؤكد الاستجابة الموثوقة كل حفظ مستقل. راجع المسودات قبل مغادرة الإعداد."
              : "Each independent save requires an authoritative response. Review unsaved drafts before leaving setup."}
          </p>
        )}
        <button className={styles.secondary} type="button" onClick={props.onOverview}>
          {ar ? "العودة إلى النظرة العامة" : "Return to overview"}
        </button>
      </div>
    </div>
  );
}
