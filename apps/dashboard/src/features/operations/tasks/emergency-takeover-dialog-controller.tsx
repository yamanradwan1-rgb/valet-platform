"use client";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { EmergencyTakeoverDialog } from "./emergency-takeover-dialog";
import { emergencyTakeoverView } from "./emergency-takeover-view";
import { useEmergencyTakeover } from "./use-emergency-takeover";

export function EmergencyTakeoverDialogController(props: {
  readonly api: DashboardApiClient;
  readonly taskId: string;
  readonly scopeKey: string;
  readonly locale: "en" | "ar";
  readonly timezone: string;
  readonly onClose: () => void;
  readonly onDenied: () => void;
  readonly onCanonicalRefresh: () => void;
}) {
  const action = useEmergencyTakeover({
    api: props.api,
    taskId: props.taskId,
    scopeKey: props.scopeKey,
    locale: props.locale,
    onCanonicalRefresh: props.onCanonicalRefresh,
    onDenied: props.onDenied,
  });
  const close = () => {
    if (action.phase === "submitting" || action.phase === "reconciling") return;
    props.onClose();
  };
  return (
    <EmergencyTakeoverDialog
      canSubmit={action.canSubmit}
      locale={props.locale}
      message={action.message}
      onClose={close}
      onReasonChange={action.editReason}
      onRefresh={action.refresh}
      onReplacementChange={action.editReplacement}
      onRetry={action.retry}
      onSearchChange={action.editSearch}
      onSubmit={action.submit}
      phase={action.phase}
      reason={action.reason}
      replacementMembershipId={action.replacementMembershipId}
      retryAllowed={action.retryAllowed}
      search={action.search}
      view={action.context ? emergencyTakeoverView(action.context, props.locale, props.timezone) : null}
    />
  );
}
