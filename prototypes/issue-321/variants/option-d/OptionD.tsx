import { useEffect, useRef } from "react";
import {
  Activity,
  Building2,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  MapPin,
  type LucideIcon,
} from "lucide-react";

import type {
  PolicySection,
  PolicySectionId,
  PolicyVariantProps,
} from "../../shared/types/variant";

import "./option-d.css";

const sectionIcons: Record<PolicySectionId, LucideIcon> = {
  overview: LayoutDashboard,
  company: Building2,
  location: MapPin,
  presence: Clock3,
  services: Activity,
};

const copy = {
  en: {
    navigation: "Policy sections",
    sections: "Sections",
    selected: "Current section",
    company: "Company",
    location: "Location",
    information: "Information",
    scope: "Working context",
    noLocation: "No location selected",
    readOnly: "Read-only",
    unavailable: "No policy sections are available for this access level.",
  },
  ar: {
    navigation: "أقسام السياسات",
    sections: "الأقسام",
    selected: "القسم الحالي",
    company: "الشركة",
    location: "الموقع",
    information: "معلومات",
    scope: "نطاق العمل",
    noLocation: "لم يتم اختيار موقع",
    readOnly: "للعرض فقط",
    unavailable: "لا توجد أقسام سياسات متاحة لمستوى الصلاحية هذا.",
  },
} as const;

export default function OptionD({
  locale,
  role,
  activeSection,
  sections,
  organizationLabel,
  locationLabel,
  onSelect,
  renderPane,
}: PolicyVariantProps) {
  const t = copy[locale];
  const selected = sections.find((section) => section.id === activeSection);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousSection = useRef(activeSection);

  useEffect(() => {
    if (previousSection.current !== activeSection) {
      previousSection.current = activeSection;
      headingRef.current?.focus();
    }
  }, [activeSection]);

  function groupName(group: PolicySection["group"]) {
    return t[group];
  }

  let previousGroup: PolicySection["group"] | undefined;

  return (
    <section
      className="issue321-option-d"
      aria-label={t.navigation}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <div className="issue321-option-d__layout">
        <aside className="issue321-option-d__rail">
          <div className="issue321-option-d__rail-header">
            <span className="issue321-option-d__eyebrow">{t.sections}</span>
          </div>

          <nav aria-label={t.navigation} className="issue321-option-d__nav">
            <ul className="issue321-option-d__nav-list">
              {sections.map((section) => {
                const showGroup = section.group !== previousGroup;
                previousGroup = section.group;
                const Icon = sectionIcons[section.id];
                const current = section.id === activeSection;

                return (
                  <li key={section.id} className="issue321-option-d__nav-entry">
                    {showGroup ? (
                      <span className="issue321-option-d__group-label">
                        {groupName(section.group)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-current={current ? "page" : undefined}
                      aria-controls="issue321-option-d-selected-pane"
                      className="issue321-option-d__nav-button"
                      onClick={() => {
                        if (!current) onSelect(section.id);
                      }}
                    >
                      <Icon aria-hidden="true" size={17} strokeWidth={1.85} />
                      <span className="issue321-option-d__nav-name">{section.label}</span>
                      {current ? (
                        <ChevronRight
                          className="issue321-option-d__active-arrow"
                          aria-hidden="true"
                          size={15}
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {role !== "DENIED" ? (
            <div className="issue321-option-d__context">
              <span className="issue321-option-d__eyebrow">{t.scope}</span>
              <div className="issue321-option-d__context-row">
                <Building2 aria-hidden="true" size={15} />
                <bdi title={organizationLabel}>{organizationLabel}</bdi>
              </div>
              <div className="issue321-option-d__context-row">
                <MapPin aria-hidden="true" size={15} />
                <bdi title={locationLabel ?? t.noLocation}>
                  {locationLabel ?? t.noLocation}
                </bdi>
              </div>
            </div>
          ) : null}
        </aside>

        <div
          className="issue321-option-d__pane"
          id="issue321-option-d-selected-pane"
          role="region"
          aria-labelledby="issue321-option-d-heading"
        >
          {selected ? (
            <>
              <header className="issue321-option-d__pane-header">
                <div className="issue321-option-d__pane-heading">
                  <span className="issue321-option-d__eyebrow">{t.selected}</span>
                  <h2 id="issue321-option-d-heading" ref={headingRef} tabIndex={-1}>
                    {selected.label}
                  </h2>
                  <p>{selected.description}</p>
                </div>
                {selected.readOnly ? (
                  <span className="issue321-option-d__read-only">{t.readOnly}</span>
                ) : null}
              </header>
              <span className="issue321-option-d__sr-only" role="status" aria-live="polite">
                {selected.label}
              </span>
              <div className="issue321-option-d__pane-body">
                {renderPane("compact")}
              </div>
            </>
          ) : (
            <div className="issue321-option-d__empty" role="status">
              <h2 id="issue321-option-d-heading">{t.sections}</h2>
              <p>{t.unavailable}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
