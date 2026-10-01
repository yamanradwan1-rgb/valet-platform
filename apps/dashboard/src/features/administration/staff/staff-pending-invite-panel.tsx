"use client";

import type {
  StaffMembershipDetail,
  StaffOnboardingResult,
} from "@valet/contracts";
import { useRef, useState } from "react";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { styles } from "../administration-ui";
import { administrationCopy } from "../administration-copy";
import { staffRoleLabel } from "./staff-labels";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { resendStaffInvite } from "./staff-onboarding-api";
import { staffOnboardingCopy } from "./staff-onboarding-copy";
import { StaffOnboardingResultPanel } from "./staff-onboarding-result";

export function StaffPendingInvitePanel(props: {
  readonly api: DashboardApiClient;
  readonly detail: StaffMembershipDetail;
  readonly organizationId: string;
  readonly reconciling: boolean;
  readonly onChanged: (detail: StaffMembershipDetail) => void;
  readonly onConflict: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = staffOnboardingCopy(locale);
  const a = administrationCopy(locale);
  const [result, setResult] = useState<StaffOnboardingResult | null>(null);
  const operationId = useRef<string | null>(null);
  const facts = props.detail.pendingInvitation;
  const mutation = useSensitiveMutation(
    `staff-resend:${props.detail.membershipId}:${props.detail.status}:${facts?.generation ?? "none"}`,
    props.onConflict,
  );
  function resend() {
    if (mutation.busy || props.reconciling || props.detail.status !== "PENDING")
      return;
    operationId.current ??= crypto.randomUUID();
    setResult(null);
    void mutation.run(
      () =>
        resendStaffInvite(
          props.api,
          props.organizationId,
          props.detail.membershipId,
          operationId.current!,
        ),
      (next) => {
        setResult(next);
        operationId.current = null;
        props.onChanged({
          ...props.detail,
          pendingInvitation: {
            generation: next.generation,
            expiresAt: next.expiresAt,
            state: "CURRENT",
          },
        });
      },
    );
  }
  return (
    <div className={styles.stack}>
      <div>
        {t.role}: {staffRoleLabel(props.detail.role, a)}
      </div>
      {props.detail.locationAccess.items.map((item) => (
        <div key={item.locationId}>
          <bdi dir="auto">{item.name}</bdi>
        </div>
      ))}
      {facts ? (
        <div className={styles.stack}>
          <div>
            {t.generation}: <bdi dir="ltr">{facts.generation}</bdi>
          </div>
          <div>
            {facts.state === "EXPIRED"
              ? t.expired
              : facts.state === "REVOKED"
                ? t.revoked
                : t.pending}
          </div>
          <div>
            {t.expires}:{" "}
            <bdi dir="ltr">
              {new Date(facts.expiresAt).toLocaleString(locale)}
            </bdi>
          </div>
        </div>
      ) : null}
      {result ? (
        <StaffOnboardingResultPanel key={result.invitationId} result={result} />
      ) : null}
      <button
        className={styles.primary}
        disabled={mutation.busy || props.reconciling}
        onClick={resend}
        type="button"
      >
        {t.resend}
      </button>
      {mutation.error ? (
        <p className={styles.error} role="alert">
          {mutation.error === a.mfaRetry ? a.mfaRetry : t.actionFailed}
        </p>
      ) : null}
      {mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={props.api}
          onAssured={mutation.onMfaAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </div>
  );
}
