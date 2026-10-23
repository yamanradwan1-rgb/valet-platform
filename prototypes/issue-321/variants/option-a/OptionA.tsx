import {
  Activity,
  Building2,
  CalendarDays,
  Layers3,
  MapPin,
  type LucideIcon,
} from "lucide-react";

import type {
  PolicySectionId,
  PolicyVariantProps,
} from "../../shared/types/variant";

import "./option-a.css";

const sectionIcons: Record<PolicySectionId, LucideIcon> = {
  overview: Layers3,
  company: Building2,
  location: MapPin,
  presence: CalendarDays,
  services: Activity,
};

const labels = {
  en: {
    nav: "Settings sections",
    sections: "Sections",
    organization: "Organization",
    location: "Location",
    noLocation: "No location selected",
    readOnly: "Read only",
    choose: "Select a settings section",
    denied: "Policies & Settings are not available for this account.",
    selected: "Selected section",
  },
  ar: {
    nav: "أقسام الإعدادات",
    sections: "الأقسام",
    organization: "الشركة",
    location: "الموقع",
    noLocation: "لم يتم اختيار موقع",
    readOnly: "للقراءة فقط",
    choose: "اختر قسمًا من الإعدادات",
    denied: "السياسات والإعدادات غير متاحة لهذا الحساب.",
    selected: "القسم المحدد",
  },
} as const;

/** Classic focused local navigation; shell, content and policy authority are owned upstream. */
export default function OptionA({
  locale,
  role,
  activeSection,
  sections,
  organizationLabel,
  locationLabel,
  onSelect,
  renderPane,
}: PolicyVariantProps) {
  const t = labels[locale];
  const active = sections.find((section) => section.id === activeSection);

  if (role === "DENIED" || sections.length === 0) {
    return (
      <div className="issue321-a-denied" role="status" lang={locale}>
        {t.denied}
      </div>
    );
  }

  return (
    <div className="issue321-a" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="issue321-a-layout">
        <aside className="issue321-a-rail">
          <div className="issue321-a-context">
            <span className="issue321-a-context-caption">{t.organization}</span>
            <strong className="issue321-a-context-name" title={organizationLabel}>
              {organizationLabel}
            </strong>
            <div className="issue321-a-location">
              <MapPin aria-hidden="true" size={14} strokeWidth={1.9} />
              <span>
                <span className="issue321-a-visually-hidden">{t.location}: </span>
                {locationLabel ?? t.noLocation}
              </span>
            </div>
          </div>

          <nav className="issue321-a-nav" aria-label={t.nav}>
            <h2 className="issue321-a-nav-heading">{t.sections}</h2>
            <ul className="issue321-a-list">
              {sections.map((section) => {
                const Icon = sectionIcons[section.id];
                const isActive = section.id === activeSection;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      className="issue321-a-link"
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => onSelect(section.id)}
                    >
                      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                      <span className="issue321-a-link-label">{section.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <section className="issue321-a-panel" aria-labelledby="issue321-a-panel-heading">
          <header className="issue321-a-panel-header">
            <div className="issue321-a-panel-title-row">
              <h2 id="issue321-a-panel-heading">{active?.label ?? t.choose}</h2>
              {active?.readOnly && (
                <span className="issue321-a-readonly">{t.readOnly}</span>
              )}
            </div>
            {active?.description && <p>{active.description}</p>}
          </header>
          <span className="issue321-a-visually-hidden" role="status" aria-live="polite">
            {active ? `${t.selected}: ${active.label}` : t.choose}
          </span>
          <div className="issue321-a-pane-body">
            {active ? renderPane("classic") : <p>{t.choose}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
