"use client";

import { useState, type ReactNode } from "react";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { styles } from "../administration-ui";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import type { PresenceApi, PresenceLocation } from "./shift-presence-api";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import type { ZoneDialogTarget } from "./shift-presence-zone-dialog";
import { presenceCopy } from "./shift-presence-copy";
import { ShiftPresenceReadiness } from "./shift-presence-readiness";
import { ShiftPresencePolicy } from "./shift-presence-policy";
import { ShiftPresenceZones } from "./shift-presence-zones";
import { ShiftPresenceExceptions } from "./shift-presence-exceptions";
import { ShiftPresenceMapFirstLayout } from "./shift-presence-map-first-layout";
import { ShiftPresenceSetupSteps } from "./shift-presence-setup-steps";
import { ShiftPresenceSetupReview, type PresencePolicyDrafts, type PresencePolicyDraftState } from "./shift-presence-setup-review";
import type { Field } from "./shift-presence-policy-fields";

type PresenceView = "overview" | "zones" | "policy" | "exceptions" | "setup";

interface Props {
  readonly api: PresenceApi;
  readonly data: PresenceLocation;
  readonly mutation: PresenceMutation;
  readonly locale: DashboardLocale;
  readonly scopeKey: string;
  readonly epoch: number;
  readonly locationName: string;
  readonly companyName: string;
  readonly loading: boolean;
  readonly drafts: PresencePolicyDrafts;
  readonly onDraftChange: (field: Field["field"], draft: PresencePolicyDraftState | null) => void;
  readonly heading: ReactNode;
  readonly onOpenZone: (target: ZoneDialogTarget) => void;
  readonly onOpenException: (id: string) => void;
}

/** UI navigation only. No setup-complete state is saved or inferred from navigation. */
export function ShiftPresenceLocationOrchestration(props: Props) {
  const [activeView, setActiveView] = useState<PresenceView>("overview");
  const [step, setStep] = useState(0);
  const t = presenceCopy(props.locale);
  const policy = (
    <ShiftPresencePolicy
      api={props.api}
      data={props.data}
      locale={props.locale}
      mutation={props.mutation}
      loading={props.loading}
      drafts={props.drafts}
      onDraftChange={props.onDraftChange}
    />
  );
  const zones = (
    <ShiftPresenceZones
      api={props.api}
      scopeKey={props.scopeKey}
      epoch={props.epoch}
      locale={props.locale}
      disabled={props.loading || props.mutation.blocked || !props.data.capabilities.canEdit}
      onOpen={props.onOpenZone}
    />
  );
  const readiness = (
    <ShiftPresenceReadiness
      data={props.data}
      locale={props.locale}
      help={<ScopedContextHelp helpKey="presence.readiness" />}
    />
  );
  const exceptions = (
    <ShiftPresenceExceptions
      api={props.api}
      blocked={props.mutation.blocked}
      scopeKey={props.scopeKey}
      epoch={props.epoch}
      locale={props.locale}
      locationName={props.locationName}
      onOpen={props.onOpenException}
    />
  );
  const setup = (
    <ShiftPresenceSetupSteps
      locale={props.locale}
      step={step}
      onStep={(next: number) => {
        if (Number.isInteger(next) && next >= 0 && next <= 3) setStep(next);
      }}
    >
      {step === 0 ? (
        <div className={styles.cardPad} data-testid="presence-setup-scope">
          <h3 className={styles.sectionTitle}>
            {props.locale === "ar" ? "نطاق الموقع" : "Location scope"}
          </h3>
          <p className={styles.sectionText}>
            {t("company")}: {props.companyName}
          </p>
          <p className={styles.sectionText}>
            {t("location")}: {props.locationName}
          </p>
          <p className={styles.muted}>
            {props.locale === "ar"
              ? "هذه الشركة وهذا الموقع هما نطاق الصلاحية الحالي. التحقق من الحضور يتم عند بدء المناوبة أو إنهائها فقط؛ لا يوجد تتبع مستمر. التنقل بين الخطوات لا يحفظ أي تعديل."
              : "This Company and Location are your current authorized scope. Presence is checked only at shift Start or End, never continuously. Changing steps does not save settings."}
          </p>
        </div>
      ) : step === 1 ? (
        <div data-testid="presence-setup-zones">
          <p className={styles.sectionText}>
            {props.locale === "ar"
              ? "احفظ كل منطقة على حدة قبل تفعيل أي سياسة إلزامية. سيؤكد الخادم الجاهزية."
              : "Save each zone individually before enabling a strict policy. The server determines readiness."}
          </p>
          {zones}
        </div>
      ) : step === 2 ? (
        <div data-testid="presence-setup-policy">
          <p className={styles.sectionText}>
            {props.locale === "ar"
              ? "كل حقل سياسة يُحفظ بشكل مستقل. القيم غير المخصصة ترث إعداد الشركة؛ لا يوجد حفظ شامل."
              : "Save policy fields independently. Unset overrides inherit Company defaults; there is no Save All."}
          </p>
          {readiness}
          {policy}
        </div>
      ) : (
        <div>
          {readiness}
          <ShiftPresenceSetupReview
            locale={props.locale}
            data={props.data}
            drafts={props.drafts}
            mutation={props.mutation}
            onOverview={() => setActiveView("overview")}
          />
        </div>
      )}
    </ShiftPresenceSetupSteps>
  );
  return (
    <ShiftPresenceMapFirstLayout
      locale={props.locale}
      heading={props.heading}
      overview={readiness}
      zones={zones}
      policy={policy}
      exceptions={exceptions}
      setup={setup}
      activeView={activeView}
      onView={(view: PresenceView) => {
        setActiveView(view);
        if (view === "setup") setStep(0);
      }}
    />
  );
}
