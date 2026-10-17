"use client";

import { useCallback, useState } from "react";
import { InvestigationSearchPanel } from "./investigation-search-panel";
import { InvestigationWorkspace } from "./investigation-workspace";
import { InvestigationEventDrawer } from "./investigation-event-drawer";
import { matchDemoSessions } from "./investigation-demo-fixtures";
import {
  DEFAULT_INVESTIGATION_QUERY,
  type DemoEvent,
  type DemoMatch,
  type InvestigationDemoLocale,
  type InvestigationDemoQuery,
} from "./investigation-demo-types";
import styles from "./investigation-demo.module.css";

const copy = {
  en: {
    invalid: "Enter a valid date and a time range where the start is before the end.",
  },
  ar: {
    invalid: "أدخل تاريخاً صحيحاً ونطاقاً زمنياً يبدأ قبل وقت الانتهاء.",
  },
} as const;

/**
 * Owner-only UI review surface. The selected Audit location is not sent to
 * any endpoint; no live Audit data or management API is used by this component.
 */
export function InvestigationDemo({ locale }: { readonly locale: InvestigationDemoLocale }) {
  const [draft, setDraft] = useState<InvestigationDemoQuery>(DEFAULT_INVESTIGATION_QUERY);
  const [applied, setApplied] = useState<InvestigationDemoQuery | null>(null);
  const [matches, setMatches] = useState<readonly DemoMatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [event, setEvent] = useState<DemoEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = copy[locale];

  const apply = useCallback(() => {
    if (!draft.date || !draft.start || !draft.end || draft.start >= draft.end) {
      setError(t.invalid);
      return;
    }
    const result = matchDemoSessions(draft);
    setError(null);
    setEvent(null);
    setApplied({ ...draft });
    setMatches(result);
    setSelectedId(result[0]?.session.id ?? null);
  }, [draft, t.invalid]);

  const clear = useCallback(() => {
    setDraft({ ...DEFAULT_INVESTIGATION_QUERY, slot: "" });
    setApplied(null);
    setMatches([]);
    setSelectedId(null);
    setEvent(null);
    setError(null);
  }, []);

  return (
    <section aria-label={locale === "ar" ? "نموذج بحث التحقيق" : "Investigation Search prototype"} className={styles.root}>
      <InvestigationSearchPanel
        locale={locale}
        value={draft}
        onChange={setDraft}
        onApply={apply}
        onClear={clear}
        error={error}
      />
      <InvestigationWorkspace
        locale={locale}
        matches={matches}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onEvent={setEvent}
        query={applied}
      />
      <InvestigationEventDrawer event={event} locale={locale} onClose={() => setEvent(null)} />
    </section>
  );
}
