import { useEffect, useMemo, useRef, useState } from "react";
import adminStyles from "../../../apps/dashboard/src/features/administration/administration.module.css";
import { allowedSections, ordinarySettings } from "../shared/fixtures/settings-catalog";
import { fixtureNotice, sampleCompanyDefaults, sampleLocationOverrides, samplePresence, scenarios } from "../shared/fixtures/simulated-data";
import type { FixtureValue } from "../shared/fixtures/settings-catalog";
import { HelpDialog } from "../shared/components/HelpDialog";
import { SettingsPane } from "../shared/components/SettingsPane";
import { ProductionDashboardShell } from "../shared/shell/ProductionDashboardShell";
import type { PolicySection, PolicySectionId, PolicyVariantProps, PrototypeLocale, PrototypeTheme } from "../shared/types/variant";
import OptionA from "../variants/option-a/OptionA";
import OptionB from "../variants/option-b/OptionB";
import OptionC from "../variants/option-c/OptionC";
import OptionD from "../variants/option-d/OptionD";
import "./prototype-controls.css";

type OptionKey = "a" | "b" | "c" | "d";
type Value = FixtureValue | "__INHERIT__";
const optionComponents: Record<OptionKey, (props: PolicyVariantProps) => React.ReactNode> = {
  a: OptionA, b: OptionB, c: OptionC, d: OptionD,
};
const optionNames = {
  a: { en: "A · Classic Focused", ar: "A · تركيز كلاسيكي" },
  b: { en: "B · Grouped Enterprise", ar: "B · مجموعات المؤسسات" },
  c: { en: "C · Context First", ar: "C · السياق أولًا" },
  d: { en: "D · Compact Workspace", ar: "D · مساحة عمل مدمجة" },
} as const;

function currentRoute() {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.slice(1).toLowerCase();
  const option = (["a", "b", "c", "d"].includes(path) ? path : "a") as OptionKey;
  const sectionRaw = params.get("section") ?? (params.get("tab") === "services" ? "services" : "company");
  const section = (["overview", "company", "location", "presence", "services"].includes(sectionRaw) ? sectionRaw : "company") as PolicySectionId;
  const scenario = scenarios.some(s => s.id === params.get("scenario")) ? params.get("scenario")! : "company-with-location";
  const locale = (params.get("lang") === "ar" ? "ar" : "en") as PrototypeLocale;
  const theme = (params.get("theme") === "dark" ? "dark" : "light") as PrototypeTheme;
  return { option, section, scenario, locale, theme };
}
function routeUrl(route: ReturnType<typeof currentRoute>) {
  const params = new URLSearchParams({ section: route.section, scenario: route.scenario, lang: route.locale, theme: route.theme });
  return `/${route.option}?${params.toString()}`;
}

function initialValues(): Record<string, Value> {
  const state: Record<string, Value> = {};
  for (const setting of ordinarySettings) {
    state[`company:${setting.key}`] = sampleCompanyDefaults[setting.key] ?? null;
    state[`location:${setting.key}`] = Object.prototype.hasOwnProperty.call(sampleLocationOverrides, setting.key)
      ? (sampleLocationOverrides[setting.key] ?? "__INHERIT__") : "__INHERIT__";
  }
  for (const [key, value] of Object.entries(samplePresence.company)) {
    state[`presence:company:${key}`] = value;
    state[`presence:location:${key}`] = "__INHERIT__";
  }
  return state;
}

function availableSections(role: "COMPANY_ADMIN" | "LOCATION_MANAGER" | "DENIED", hasLocation: boolean, locale: PrototypeLocale): PolicySection[] {
  const allowed = allowedSections(role, hasLocation);
  return allowed.map(section => ({
    id: section.id as PolicySectionId,
    label: section.label[locale],
    description: {
      overview: locale === "ar" ? "ملخص هيكل الإعدادات" : "Configuration structure",
      company: locale === "ar" ? "القيم الأساسية" : "Shared starting values",
      location: locale === "ar" ? "استثناءات الموقع المخوّل" : "Authorized location values",
      presence: locale === "ar" ? "بدء وإنهاء الوردية" : "Shift start and end checks",
      services: locale === "ar" ? "للقراءة فقط" : "Read-only technical status",
    }[section.id],
    group: section.id === "company" ? "company" : section.id === "location" || section.id === "presence" ? "location" : "information",
    readOnly: section.id === "overview" || section.id === "services",
  }));
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const [draft, setDraft] = useState(initialValues);
  const [saved, setSaved] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const routeRef = useRef(route);
  const dirty = Object.keys(draft).some(key => draft[key] !== saved[key]);
  const dirtyRef = useRef(dirty);
  const savedRef = useRef(saved);
  routeRef.current = route;
  dirtyRef.current = dirty;
  savedRef.current = saved;
  const scenario = scenarios.find(s => s.id === route.scenario) ?? scenarios[0];
  const hasLocation = scenario.hasLocation;
  const eligible = useMemo(() => availableSections(scenario.role, hasLocation, route.locale), [scenario.role, hasLocation, route.locale]);
  const selected = eligible.some(section => section.id === route.section) ? route.section : (eligible[0]?.id ?? "overview");
  // Exact nonproduction labels from the W1 repository browser fixture.
  const organization = "Acme Valet";
  const location = hasLocation ? "Main Garage" : null;

  useEffect(() => {
    document.documentElement.lang = route.locale;
    document.documentElement.dir = route.locale === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = route.theme;
  }, [route.locale, route.theme]);
  useEffect(() => {
    function onPop() {
      if (dirtyRef.current && !window.confirm(routeRef.current.locale === "ar" ? "توجد تغييرات غير محفوظة. هل تريد مغادرة القسم؟" : "You have unsaved changes. Leave this section?")) {
        window.history.pushState({}, "", routeUrl(routeRef.current));
        return;
      }
      if (dirtyRef.current) setDraft({ ...savedRef.current });
      setRoute(currentRoute());
      setError(null);
    }
    function onUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("beforeunload", onUnload); };
  }, []);

  function change(next: Partial<typeof route>, confirmDirty = false) {
    if (confirmDirty && dirty && !window.confirm(route.locale === "ar" ? "توجد تغييرات غير محفوظة. هل تريد المتابعة؟" : "Discard unsaved changes and continue?")) return;
    if (confirmDirty && dirty) setDraft({ ...saved });
    const updated = { ...route, ...next };
    window.history.pushState({}, "", routeUrl(updated));
    setRoute(updated);
    setError(null);
    setNotice("");
    if (next.scenario && next.scenario !== route.scenario) { setDraft(initialValues()); setSaved(initialValues()); }
  }

  function onSave(key: string) {
    const value = draft[key];
    const field = ordinarySettings.find(item => key.endsWith(`:${item.key}`));
    const min = key.includes("MaxAccuracy") || key.includes("MaxFixAge") || key.endsWith(":rawGpsRetentionDays") ? 1 : 0;
    const numericInvalid = field && (field.kind === "integer" || field.kind === "money") &&
      value !== "__INHERIT__" && (value === "" || !Number.isFinite(Number(value)) ||
        Number(value) < min || (field.kind === "integer" && !Number.isInteger(Number(value))) ||
        (field.kind === "money" && !/^\\d+(?:\\.\\d{1,3})?$/.test(String(value))));
    const presenceInvalid = key.startsWith("presence:") && value !== "__INHERIT__" && (
      value === "" || (typeof value === "number" && (!Number.isFinite(value) || value < 1 ||
        (key.endsWith("Meters") ? value > 200 : key.endsWith("Seconds") ? value > 120 : false))));
    if (value === "" || numericInvalid || presenceInvalid) {
      setError(route.locale === "ar" ? "قيمة غير صالحة في المحاكاة." : "Simulated validation error: enter a valid value.");
      return;
    }
    setSaved(previous => ({ ...previous, [key]: value }));
    setError(null);
    setNotice(route.locale === "ar" ? "تم حفظ القيمة في ذاكرة النموذج فقط." : "Saved to prototype memory only. No API request was sent.");
  }

  const Variant = optionComponents[route.option];
  return <ProductionDashboardShell locale={route.locale} theme={route.theme} role={scenario.role}
    organization={organization} location={location}
    onLocaleChange={locale => change({ locale })}
    onThemeChange={theme => change({ theme })}
    onSelectLocation={() => change({ scenario: hasLocation ? "company-no-location" : "company-with-location", section: "location" }, true)}>
    <div className={`${adminStyles.page} ${adminStyles.pageHelpInGap} p321-page`}>
      <div className={adminStyles.header}><div><h1 className={adminStyles.title}>
        {route.locale === "ar" ? "السياسات والإعدادات" : "Policies & Settings"}</h1>
        <p className={`${adminStyles.subtitle} ${adminStyles.subtitleSm} ${adminStyles.subtitleHalf}`}>
          {route.locale === "ar" ? "إدارة الإعدادات التشغيلية المحددة." : "Manage typed operational configuration."}</p>
      </div></div>
      <div className={adminStyles.helpGapRow}><HelpDialog helpKey="policies.page" locale={route.locale} /></div>
      <div className="p321-fixture-banner" role="note">{fixtureNotice[route.locale]}</div>
      <div className="p321-demo-controls">
        <fieldset className="p321-options"><legend>{route.locale === "ar" ? "مقارنة التصاميم" : "Compare design options"}</legend>
          {(Object.keys(optionNames) as OptionKey[]).map(key => <button key={key} type="button"
            aria-pressed={route.option === key} onClick={() => change({ option: key }, true)}>{optionNames[key][route.locale]}</button>)}
        </fieldset>
        <label className="p321-scenario-label">{route.locale === "ar" ? "محاكاة الصلاحية والنطاق" : "Role & scope simulation"}
          <select data-testid="scenario" value={scenario.id} onChange={e => change({ scenario: e.target.value, section: e.target.value === "location-manager" ? "location" : "company" }, true)}>
            {scenarios.map(entry => <option key={entry.id} value={entry.id}>{entry.label[route.locale]}</option>)}
          </select></label>
      </div>
      {notice && <p role="status" className="p321-toast">{notice}</p>}
      {eligible.length === 0 ? <div className="p321-empty" role="status">{route.locale === "ar" ?
        "هذا الدور لا يملك صلاحية إعدادات الإدارة في المحاكاة." :
        "This role has no Policies & Settings access in the simulation."}</div> : <Variant locale={route.locale} role={scenario.role} activeSection={selected} sections={eligible}
        organizationLabel={organization} locationLabel={location}
        onSelect={section => change({ section }, true)}
        renderPane={presentation => <SettingsPane section={selected} locale={route.locale} role={scenario.role}
          hasLocation={hasLocation} presentation={presentation} draft={draft} saved={saved} error={error}
          onChange={(key, value) => { setDraft(old => ({ ...old, [key]: value })); setNotice(""); }} onSave={onSave}
          onConflict={() => setError(route.locale === "ar" ? "محاكاة تعارض 409: تغير الإصدار على الخادم؛ راجع القيم قبل إعادة المحاولة." : "Simulated 409 conflict: server revision changed. Review values before retrying.")}
          onSelect={section => change({ section }, true)} />}
      />}
    </div>
  </ProductionDashboardShell>;
}
