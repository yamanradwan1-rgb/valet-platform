"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { proveLocationSwitchCandidate } from "../../components/scope/location-switch-authority";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { resolveCompanyAdminContext } from "../../lib/scope/dashboard-scope";
import { administrationScope, administrationScopeKey } from "../administration/administration-scope";
import { useAuthoritativeRead } from "../administration/use-authoritative-read";
import { translate } from "./approved-elements";
import {
  changePublication, contactView, defaultsView, privacyView, readCompanyContact,
  readLocationContact, readOverview, readPreview, readPrivacy,
  saveCompanyContact, saveLocationContact, savePrivacy,
} from "./guest-information-api";
import { ContactSection } from "./contact-section";
import { contactCounts, type ContactDefaults, type LocationContact } from "./guest-information-model";
import { OverviewSection } from "./overview-section";
import { PrivacySection } from "./privacy-section";
import {
  GuestSectionNavigation, type GuestInformationView,
} from "./section-navigation";
import "./approved-feature.css";
import "./approved-option2.css";

type Notice = { readonly text: string; readonly kind: "error" | "info" | "success" };

export function GuestInformationPage() {
  const dashboard = useProtectedDashboard();
  const scopeKey = administrationScopeKey(dashboard);
  return <GuestInformationContent key={scopeKey} />;
}

function GuestInformationContent() {
  const dashboard = useProtectedDashboard();
  const { selectScope } = useSelectedScope();
  const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard);
  const { locale, setLocale } = useDashboardLocale();
  const [view, setView] = useState<GuestInformationView>("overview");
  const [dirty, setDirty] = useState({ privacy: false, location: false, company: false });
  const [notice, setNotice] = useState<Notice | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  const locationSwitch = useRef<AbortController | null>(null);
  useEffect(() => () => locationSwitch.current?.abort(), []);
  const setPrivacyDirty = useCallback((value: boolean) =>
    setDirty((state) => state.privacy === value ? state : { ...state, privacy: value }), []);
  const setLocationDirty = useCallback((value: boolean) =>
    setDirty((state) => state.location === value ? state : { ...state, location: value }), []);
  const setCompanyDirty = useCallback((value: boolean) =>
    setDirty((state) => state.company === value ? state : { ...state, company: value }), []);
  const organizationId = scope.organizationId;
  const overviewLoader = useCallback((signal: AbortSignal) =>
    readOverview(dashboard.api, organizationId, locale, signal),
  [dashboard.api, organizationId, locale]);
  const overview = useAuthoritativeRead(`${scopeKey}:guest-overview:${locale}`, overviewLoader);
  const locationId = scope.locationId;
  // SelectedDashboardScope is the authority-bearing location. Locale changes
  // must not unmount unsaved editors while their locale-specific reads refresh.
  const validLocation = locationId !== null;
  const privacyLoader = useCallback((signal: AbortSignal) =>
    readPrivacy(dashboard.api, organizationId, locationId!, signal),
  [dashboard.api, organizationId, locationId]);
  const privacy = useAuthoritativeRead(
    `${scopeKey}:guest-privacy:${locationId}`, privacyLoader, validLocation);
  const defaultsLoader = useCallback((signal: AbortSignal) =>
    readCompanyContact(dashboard.api, organizationId, signal),
  [dashboard.api, organizationId]);
  const defaults = useAuthoritativeRead(
    `${scopeKey}:guest-defaults`, defaultsLoader);
  const contactLoader = useCallback((signal: AbortSignal) =>
    readLocationContact(dashboard.api, organizationId, locationId!, signal),
  [dashboard.api, organizationId, locationId]);
  const contact = useAuthoritativeRead(
    `${scopeKey}:guest-contact:${locationId}`, contactLoader, validLocation);
  const previewLoader = useCallback((signal: AbortSignal) =>
    readPreview(dashboard.api, organizationId, locationId!, locale, signal),
  [dashboard.api, organizationId, locationId, locale]);
  const preview = useAuthoritativeRead(
    `${scopeKey}:guest-preview:${locationId}:${locale}`, previewLoader, validLocation);
  const isLoading = [privacy, defaults, contact].some((item) => item.loading);
  const error = [privacy, defaults, contact].find((item) => item.error)?.error;
  const locationName = dashboard.selectedScope.authority === "COMPANY_ADMIN"
    ? dashboard.selectedScope.context.selectedLocation?.name ?? ""
    : dashboard.selectedScope.authority === "LOCATION_MANAGER"
      ? dashboard.selectedScope.location.name : "";
  const companyName = dashboard.selectedScope.authority === "COMPANY_ADMIN"
    ? dashboard.selectedScope.context.organization.name
    : dashboard.selectedScope.authority === "LOCATION_MANAGER"
      ? dashboard.selectedScope.organization.name : "";
  const show = (message: string, kind: Notice["kind"] = "info") =>
    setNotice({ text: message, kind });
  const retry = () => {
    overview.refresh(); privacy.refresh(); defaults.refresh();
    contact.refresh(); preview.refresh();
  };
  async function chooseLocation(id: string) {
    if (id === locationId || dashboard.selectedScope.authority !== "COMPANY_ADMIN") return;
    if ((dirty.privacy || dirty.location || dirty.company) &&
      !window.confirm(translate(locale,
        "You have unsaved changes. Discard them and continue?",
        "لديك تعديلات غير محفوظة. هل تريد تجاهلها والمتابعة؟"))) return;
    locationSwitch.current?.abort();
    const controller = new AbortController();
    locationSwitch.current = controller;
    try {
      const candidate = await resolveCompanyAdminContext(dashboard.api,
        organizationId, { kind: "LOCATION", locationId: id }, controller.signal);
      if (!candidate.selectedLocation || candidate.selectedLocation.locationId !== id) {
        throw new Error("Location is not available in this scope.");
      }
      const proof = await proveLocationSwitchCandidate({
        accessRequirement: "DASHBOARD", api: dashboard.api,
        candidate: { kind: "LOCATION", location: candidate.selectedLocation },
        currentPath: "/guest-information",
        currentScope: dashboard.selectedScope,
        requestKey: `${scopeKey}:guest-switch:${id}`,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (proof.kind !== "READY" || proof.destination !== null) {
        throw new Error("Location is not available in this scope.");
      }
      selectScope(proof.scope);
    } catch (reason: unknown) {
      if (!controller.signal.aborted) show(reason instanceof Error
        ? reason.message : translate(locale, "Location selection failed.",
          "تعذر اختيار الموقع."), "error");
    } finally {
      if (locationSwitch.current === controller) locationSwitch.current = null;
    }
  }
  function changeView(next: GuestInformationView, focus = false) {
    setView(next);
    if (focus) {
      requestAnimationFrame(() => {
        const heading = pane.current?.querySelector<HTMLElement>(
          `[data-view="${next}"] h2, [data-view="${next}"] h3`);
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      });
    }
  }
  async function commit(task: () => Promise<unknown>, confirmation: string) {
    setNotice(null);
    try {
      await task();
      show(confirmation, "success");
      retry();
    } catch (reason: unknown) {
      show(reason instanceof Error ? reason.message :
        translate(locale, "Save failed.", "تعذّر الحفظ."), "error");
    }
  }
  const loaded = privacy.data && defaults.data && contact.data && validLocation && locationId;
  const currentPrivacy = privacy.data ? privacyView(privacy.data) : null;
  const currentDefaults = defaults.data ? defaultsView(defaults.data) : null;
  const currentContact = contact.data ? contactView(contact.data) : null;
  const counts = currentDefaults && currentContact
    ? contactCounts(currentDefaults, currentContact) : null;
  return (
    <>
      <div id="demo-announcement" hidden={!notice}
        className={`v-announcement ${notice ? `v-announcement-${notice.kind}` : ""}`}
        role={notice?.kind === "error" ? "alert" : "status"}
        aria-live={notice?.kind === "error" ? "assertive" : "polite"}>
        {notice?.text}
      </div>
      <div className="opt2-page">
        <header className="opt2-mast">
          <div>
            <div className="opt2-path">
              {translate(locale, "Dashboard / Privacy & Contact", "لوحة التحكم / الخصوصية والتواصل")}
            </div>
            <h1>{translate(locale, "Privacy & Contact", "الخصوصية والتواصل")}</h1>
            <p>{translate(locale, "Manage what guests see for this location.",
              "تحكّم بالمعلومات التي يراها الضيف في هذا الموقع.")}</p>
            <span className="opt2-location">
              <span>{translate(locale, "Location:", "الموقع:")}</span>{" "}
              <strong>{locationName || translate(locale, "Not set", "غير محدد")}</strong>
            </span>
          </div>
        </header>
        <div className="opt2-layout">
          <GuestSectionNavigation locale={locale} active={view}
            onSelect={(next) => changeView(next)} />
          <div className="opt2-content" ref={pane} role="region"
            aria-label={translate(locale, "Selected guest settings", "إعدادات الضيف المحددة")}>
            {isLoading && !loaded ? <div className="v-empty" role="status">
              {translate(locale, "Loading…", "جارٍ التحميل…")}
            </div> : error ? (
              <div className="v-empty" role="alert">
                {error.message} <button type="button" onClick={retry}>
                  {translate(locale, "Retry", "إعادة المحاولة")}
                </button>
              </div>
            ) : loaded && currentPrivacy && currentDefaults && currentContact && counts ? (
              <>
                {overview.data ? (
                  <OverviewSection active={view === "overview"} locale={locale}
                    overview={overview.data}
                    locationId={locationId} locationName={locationName}
                    privacy={currentPrivacy}
                    configured={counts.configured} customized={counts.customized}
                    onReviewPrivacy={() => changeView("privacy", true)}
                    onSelectLocation={(id) => void chooseLocation(id)} />
                ) : view === "overview" ? (
                  <div className="v-empty" role={overview.error ? "alert" : "status"}>
                    {overview.error?.message ??
                      translate(locale, "Loading…", "جارٍ التحميل…")}
                  </div>
                ) : null}
                  <PrivacySection active={view === "privacy"}
                    locale={locale} locationName={locationName}
                    privacy={currentPrivacy} onLocaleChange={setLocale}
                    announce={show} onDirtyChange={setPrivacyDirty}
                    onOperation={async (operation, drafts) => commit(
                      () => operation === "save"
                        ? savePrivacy(dashboard.api, organizationId, locationId,
                          currentPrivacy.revision, drafts)
                        : changePublication(dashboard.api, organizationId, locationId,
                          currentPrivacy.revision, operation),
                      translate(locale, "Privacy updated.", "تم تحديث الخصوصية."))} />
                  <ContactSection active={view === "contact"}
                    locale={locale} locationName={locationName}
                    companyName={companyName} defaults={currentDefaults}
                    contact={currentContact} preview={preview.data}
                    canEditCompany={scope.authority === "COMPANY_ADMIN"} announce={show}
                    onCompanyDirty={setCompanyDirty} onLocationDirty={setLocationDirty}
                    onSaveCompany={async (value: ContactDefaults) => commit(
                      () => saveCompanyContact(dashboard.api, organizationId, value),
                      translate(locale, "Contact saved.", "تم حفظ التواصل."))}
                    onSaveLocation={async (value: LocationContact) => commit(
                      () => saveLocationContact(dashboard.api, organizationId, locationId, value),
                      translate(locale, "Contact saved.", "تم حفظ التواصل."))} />
              </>
            ) : <div className="v-empty">
              {translate(locale, "Select a Location to view this information.",
                "اختر موقعاً لعرض هذه المعلومات.")}
            </div>}
          </div>
        </div>
        <p className="opt2-footer">
          {translate(locale, "Demo data only. No changes are published.",
            "بيانات تجريبية فقط. لا تُنشر أي تغييرات.")}
        </p>
      </div>
    </>
  );
}
