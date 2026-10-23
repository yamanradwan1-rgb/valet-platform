import { ArrowRight, Building2, Layers3, LockKeyhole, MapPin } from "lucide-react";
import type { PolicyVariantProps } from "../../shared/types/variant";
import "./option-c.css";

const copy = {
  en: {
    title: "Policies & Settings",
    subtitle: "Configure policies in the context where they apply.",
    context: "Configuration scope",
    company: "Organization",
    companySource: "Company defaults",
    location: "Location",
    locationSource: "Optional location overrides",
    noLocation: "No location selected",
    inheritance: "For inherited settings, a location uses the company default until an authorized override is saved.",
    noLocationHelp: "Select a location in the Dashboard header to inspect its overrides.",
    navigation: "Settings sections",
    navigationHint: "Choose one area to work on",
    readOnly: "Read only",
    companyScope: "Company",
    locationScope: "Location",
    informationScope: "Information",
    pane: "Selected section",
    companyHelp: "These defaults are the starting values for location-level configuration.",
    locationHelp: "Inherited settings resolve from company defaults or saved location overrides. Location-only fields are separate.",
    presenceHelp: "Presence policy may be defined at company scope and adjusted for an authorized location.",
    servicesHelp: "Service status is informational. It does not change provider configuration.",
    overviewHelp: "Use the sections on the left to inspect the settings available to your role and scope.",
    selectSection: "Select an available section to inspect its settings.",
    denied: "You do not have access to Policies & Settings for this scope.",
  },
  ar: {
    title: "السياسات والإعدادات",
    subtitle: "اضبط السياسات ضمن النطاق الذي تنطبق عليه.",
    context: "نطاق الإعدادات",
    company: "المؤسسة",
    companySource: "إعدادات الشركة الافتراضية",
    location: "الموقع",
    locationSource: "تخصيصات الموقع الاختيارية",
    noLocation: "لم يتم تحديد موقع",
    inheritance: "بالنسبة للإعدادات القابلة للوراثة، يستخدم الموقع قيمة الشركة حتى يُحفظ تخصيص مصرح به.",
    noLocationHelp: "اختر موقعًا من شريط الداشبورد العلوي لعرض تخصيصاته.",
    navigation: "أقسام الإعدادات",
    navigationHint: "اختر قسمًا واحدًا للعمل عليه",
    readOnly: "للقراءة فقط",
    companyScope: "الشركة",
    locationScope: "الموقع",
    informationScope: "معلومات",
    pane: "القسم المحدد",
    companyHelp: "هذه الإعدادات هي القيم الأساسية لإعدادات المواقع.",
    locationHelp: "تُحدَّد القيم الموروثة من إعدادات الشركة أو تخصيصات الموقع المحفوظة، بينما تبقى الحقول الخاصة بالموقع مستقلة.",
    presenceHelp: "يمكن تحديد سياسة حضور الورديات على مستوى الشركة وتخصيصها للموقع المصرح به.",
    servicesHelp: "حالة الخدمات معلومات للعرض، ولا تغيّر إعدادات مزوّدي الخدمة.",
    overviewHelp: "استخدم الأقسام لاطّلاع على الإعدادات المتاحة حسب دورك ونطاقك.",
    selectSection: "اختر قسمًا متاحًا لعرض إعداداته.",
    denied: "لا تملك صلاحية الوصول إلى السياسات والإعدادات لهذا النطاق.",
  },
} as const;

export default function OptionC(props: PolicyVariantProps) {
  const t = copy[props.locale];
  const selected = props.sections.find((section) => section.id === props.activeSection);
  const hasAccess = props.role !== "DENIED" && props.sections.length > 0;
  const showInheritance = selected?.id !== "services";
  const contextualNote = !props.locationLabel && selected?.id === "location"
    ? t.noLocationHelp
    : selected?.id === "company"
      ? t.companyHelp
      : selected?.id === "location"
        ? t.locationHelp
        : selected?.id === "presence"
          ? t.presenceHelp
          : selected?.id === "services"
            ? t.servicesHelp
            : t.overviewHelp;
  const scopeLabels = {
    company: t.companyScope,
    location: t.locationScope,
    information: t.informationScope,
  };

  return (
    <div className="p321-c" dir={props.locale === "ar" ? "rtl" : "ltr"}>
      <header className="p321-c-intro">
        <div>
          <h2>{t.title}</h2>
          <p>{t.subtitle}</p>
        </div>
      </header>

      {!hasAccess ? (
        <section className="p321-c-denied" role="status">
          <LockKeyhole size={22} aria-hidden="true" />
          <p>{t.denied}</p>
        </section>
      ) : (
        <>
          <section className="p321-c-context" aria-label={t.context}>
            <div className="p321-c-context-label">
              <Layers3 size={16} aria-hidden="true" />
              <span>{t.context}</span>
            </div>
            <div className={showInheritance ? "p321-c-scope-chain" : "p321-c-scope-chain p321-c-scope-chain--single"}>
              <div className="p321-c-scope-node">
                <Building2 size={18} aria-hidden="true" />
                <div>
                  <span>{t.company} · {t.companySource}</span>
                  <strong><bdi>{props.organizationLabel}</bdi></strong>
                </div>
              </div>
              {showInheritance ? (
                <>
                  <ArrowRight className="p321-c-chain-arrow" size={19} aria-hidden="true" />
                  <div className="p321-c-scope-node">
                    <MapPin size={18} aria-hidden="true" />
                    <div>
                      <span>{t.location} · {t.locationSource}</span>
                      <strong><bdi>{props.locationLabel ?? t.noLocation}</bdi></strong>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            {showInheritance ? <p className="p321-c-inheritance">{t.inheritance}</p> : null}
          </section>

          <div className="p321-c-workspace">
            <aside className="p321-c-sidebar">
              <div className="p321-c-nav-heading">
                <h2>{t.navigation}</h2>
                <p>{t.navigationHint}</p>
              </div>
              <nav aria-label={t.navigation}>
                <ul className="p321-c-nav-list">
                  {props.sections.map((section) => (
                    <li key={section.id}>
                      <button
                        type="button"
                        className="p321-c-nav-button"
                        aria-current={section.id === props.activeSection ? "true" : undefined}
                        aria-controls="p321-c-selected-pane"
                        onClick={() => props.onSelect(section.id)}
                      >
                        <span className="p321-c-nav-top">
                          <span className="p321-c-nav-title">{section.label}</span>
                          {section.readOnly ? <LockKeyhole size={14} aria-hidden="true" /> : null}
                        </span>
                        <span className="p321-c-nav-description">{section.description}</span>
                        <span className="p321-c-nav-meta">
                          {scopeLabels[section.group]}
                          {section.readOnly ? <span> · {t.readOnly}</span> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            <section
              id="p321-c-selected-pane"
              className="p321-c-pane"
              aria-labelledby="p321-c-selected-heading"
            >
              {selected ? (
                <>
                  <header className="p321-c-pane-heading">
                    <span className="p321-c-pane-eyebrow">{t.pane}</span>
                    <h2 id="p321-c-selected-heading" aria-live="polite">{selected.label}</h2>
                    <p>{selected.description}</p>
                  </header>
                  <div className="p321-c-pane-note" role="note">
                    <Layers3 size={18} aria-hidden="true" />
                    <span>{contextualNote}</span>
                  </div>
                  <div className="p321-c-pane-body">{props.renderPane("context")}</div>
                </>
              ) : (
                <div className="p321-c-pane-heading">
                  <h2 id="p321-c-selected-heading">{t.navigation}</h2>
                  <p>{t.selectSection}</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
