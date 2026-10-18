"use client";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { InvestigationEventDrawer } from "./investigation-event-drawer";
import { InvestigationSearchPanel } from "./investigation-search-panel";
import { InvestigationWorkspace } from "./investigation-workspace";
import type { InvestigationDemoLocale } from "./investigation-demo-types";
import type { InvestigationSearchScope } from "./investigation/search/investigation-search-scope";
import { useInvestigationLiveController } from "./investigation/live/investigation-live-controller";
import styles from "./investigation-demo.module.css";

interface Props {
  readonly locale: InvestigationDemoLocale;
  readonly api: DashboardApiClient;
  readonly scope: InvestigationSearchScope;
  readonly locationName: string;
  readonly locationTimezone: string;
}

export function InvestigationLive({ locale, api, scope, locationName, locationTimezone }: Props) {
  const scopeKey = [scope.organizationId, scope.locationId, scope.role,
    scope.identityGeneration, scope.sessionGeneration, scope.selectionRevision,
    locationTimezone].join(":");
  const data = useInvestigationLiveController({
    locale, api, scope, scopeKey, locationName, locationTimezone,
  });
  return (
    <section aria-label={locale === "ar" ? "بحث التحقيق الحقيقي" : "Live Investigation Search"}
      className={styles.root}>
      <InvestigationSearchPanel locale={locale} value={data.draft} onChange={data.setDraft}
        onApply={() => void data.apply()} onClear={data.clear} error={data.error}
        live locationName={locationName} locationTimezone={locationTimezone}
        employeeOptions={data.selectors.memberOptions}
        memberOversized={data.selectors.memberOversized}
        memberBusy={data.selectors.memberBusy}
        memberError={data.selectors.memberError}
        memberUnpaged={data.selectors.memberUnpaged}
        memberPage={data.selectors.memberPage}
        memberHasNext={data.selectors.memberHasNext}
        memberHasPrevious={data.selectors.memberHasPrevious}
        onMemberChange={data.selectors.retainMember}
        onMemberRefine={data.selectors.memberRefine}
        onMemberNext={data.selectors.memberNext}
        onMemberPrevious={data.selectors.memberPrevious}
        slotOptions={data.selectors.options?.slots ?? []}
        selectorError={data.selectors.optionsError} />
      <InvestigationWorkspace locale={locale} matches={data.matches} selectedId={data.selectedId}
        onSelect={data.select} onEvent={(row) => void data.openEvent(row)}
        query={data.applied} loading={data.busy} timelineLoading={data.timelineBusy}
        error={data.error} timelineError={data.timelineError}
        searchPage={data.searchPage} onSearchMore={() => void data.loadMoreSearch()}
        onTimelineMore={data.loadMoreTimeline} locationTimezone={locationTimezone} />
      <InvestigationEventDrawer event={data.event} locale={locale}
        onClose={() => data.setEvent(null)} />
    </section>
  );
}
