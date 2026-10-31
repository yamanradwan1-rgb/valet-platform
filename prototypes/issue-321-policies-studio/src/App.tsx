import { useEffect, useState, type MouseEvent } from "react";
import { DashboardShell } from "@dashboard/components/shell/dashboard-shell";
import { Button } from "@dashboard/components/presentation/button";
import { FocusDialog } from "@dashboard/components/presentation/focus-dialog";
import {
  HeaderLocaleControl,
  HeaderThemeControl,
} from "@dashboard/components/foundation/header-preferences";
import { dashboardShellLabels } from "@dashboard/components/foundation/dashboard-shell-labels";
import { useDashboardLocale } from "@dashboard/lib/i18n/locale-provider";
import { dashboardNavigationRegistrations } from "@dashboard/lib/navigation/dashboard-navigation";
import { resolveNavigation } from "@dashboard/lib/navigation/navigation-registry";
import {
  companyKey,
  defaultValues,
  loadStore,
  locationKey,
  locations,
  organizations,
  savedOverrides,
  STORAGE_KEY,
} from "./fixtures";
import { StudioProvider } from "./studio-context";
import { usePreviewRoute, type PreviewRoute } from "./use-preview-route";
import { PreviewDialogs } from "./PreviewDialogs";
import { Workspace } from "./Workspace";
import { ui } from "./copy";
import type { Scalar } from "./catalog";
import { allowsLocalPresenceChange } from "./presence-readiness";

export function App() {
  const { locale, t } = useDashboardLocale();
  const copy = ui[locale];
  const [store, setStore] = useState(loadStore);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [discardEpoch, setDiscardEpoch] = useState(0);
  const router = usePreviewRoute(dirty, () => {
    setDirty(false);
    setDiscardEpoch((value) => value + 1);
    setNotice("");
  });
  const { route, navigate } = router;
  const [dialog, setDialog] = useState<
    "organization" | "location" | "controls" | null
  >(null);
  const identity = [
    route.org,
    route.location,
    route.scope,
    route.role,
    route.section,
    route.scenario,
    route.setting,
    discardEpoch,
  ].join(":");
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);
  useEffect(() => {
    requestAnimationFrame(() => {
      const target = route.setting
        ? document.querySelector<HTMLElement>(
            `[data-setting="${route.setting}"]`,
          )
        : null;
      if (target) {
        target.scrollIntoView({ block: "center" });
        const button =
          target.querySelector<HTMLButtonElement>(".ps-edit-button");
        if (button) button.focus({ preventScroll: true });
        else {
          target.tabIndex = -1;
          target.focus({ preventScroll: true });
        }
      } else
        document
          .getElementById("studio-heading")
          ?.focus({ preventScroll: true });
    });
  }, [identity]);
  const defaults = defaultValues(store, route.org);
  const overrides = savedOverrides(store, route.org, route.location);
  const editable =
    route.role !== "DENIED" &&
    !(
      route.scenario === "readonly" &&
      ["presence", "zones"].includes(route.section)
    );
  function save(key: string, value: Scalar, clear = false) {
    if (!editable || route.role === "DENIED") return false;
    if (
      key.startsWith("shift") &&
      !allowsLocalPresenceChange(
        store,
        route.org,
        route.scope === "location" ? route.location : null,
        key,
        value,
        clear,
      )
    )
      return false;
    const keyScope =
      route.scope === "company"
        ? companyKey(route.org)
        : locationKey(route.org, route.location);
    setStore((old) => ({
      ...old,
      settings: {
        ...old.settings,
        [keyScope]: { ...old.settings[keyScope], [key]: clear ? null : value },
      },
    }));
    setDirty(false);
    setNotice(copy.localSave);
    return true;
  }
  const navigationItems = resolveNavigation(
    dashboardNavigationRegistrations,
    {
      role: route.role === "DENIED" ? "SUPERVISOR" : route.role,
      organizationId: route.org,
      locationId: route.location === "none" ? null : route.location,
    },
    locale,
    {
      commercial: {
        dashboardAccess: true,
        basicBranding: true,
        subscriptionRead: true,
      },
      features: { MANAGEMENT_AUDIT: "ELIGIBLE", VISIT_CONTACTS: "ELIGIBLE" },
      foundationEntryEligible: true,
      locationMapsEligible: true,
      managementIntelligenceEligible: true,
    },
  );
  const organization = organizations.find((item) => item.id === route.org)!;
  const location = locations.find((item) => item.id === route.location);
  function followLocalLink(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || event.ctrlKey || event.metaKey) return;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    navigate({ path: url.pathname });
  }
  function select(patch: Partial<PreviewRoute>) {
    setDialog(null);
    navigate(patch);
  }
  return (
    <StudioProvider
      value={{
        route,
        locale,
        store,
        identity,
        editable,
        dirty,
        setDirty,
        defaults,
        overrides,
        save,
        updateStore: setStore,
        navigate,
        notice,
        announce: setNotice,
      }}
    >
      <div onClick={followLocalLink}>
        <DashboardShell
          accountControl={
            <Button variant="quiet" onClick={() => setDialog("controls")}>
              {t("logout")}
            </Button>
          }
          currentPath={route.path}
          labels={dashboardShellLabels(t)}
          localeControl={<HeaderLocaleControl />}
          themeControl={<HeaderThemeControl />}
          navigationItems={navigationItems}
          onOrganizationSelect={() => setDialog("organization")}
          onLocationSelect={() => setDialog("location")}
          selectedOrganization={{
            id: organization.id,
            label: organization[locale],
          }}
          selectedLocation={
            location ? { id: location.id, label: location[locale] } : null
          }
        >
          {route.path === "/policies" ? (
            <Workspace
              key={identity}
              onControls={() => setDialog("controls")}
            />
          ) : (
            <section className="ps-workspace ps-away">
              <h1 id="studio-heading" tabIndex={-1}>
                {locale === "ar"
                  ? "خارج نطاق النموذج"
                  : "Outside this prototype"}
              </h1>
              <p>
                {locale === "ar"
                  ? "وجهات لوحة الإدارة الأخرى غير مرتبطة في هذه المعاينة المحلية."
                  : "Other Dashboard destinations are not connected in this local preview."}
              </p>
              <Button onClick={() => navigate({ path: "/policies" })}>
                {locale === "ar"
                  ? "العودة إلى الإعدادات"
                  : "Return to settings"}
              </Button>
            </section>
          )}
        </DashboardShell>
      </div>
      <PreviewDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSelect={select}
      />
      {router.pending && (
        <FocusDialog label={copy.leave} onClose={router.cancel}>
          <div className="ps-dialog">
            <h2>{copy.leave}</h2>
            <p>{copy.leaveBody}</p>
            <div className="ps-actions">
              <Button variant="secondary" onClick={router.cancel}>
                {copy.stay}
              </Button>
              <Button onClick={router.confirm}>{copy.discard}</Button>
            </div>
          </div>
        </FocusDialog>
      )}
    </StudioProvider>
  );
}
