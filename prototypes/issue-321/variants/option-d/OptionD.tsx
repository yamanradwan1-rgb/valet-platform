import { useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Layers3,
  MapPin,
  MapPinned,
  PanelLeft,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

import type {
  PolicySection,
  PolicySectionId,
  PolicyVariantProps,
} from "../../shared/types/variant";

import "./option-d.css";

const sectionIcons: Partial<Record<PolicySectionId, LucideIcon>> = {
  overview: LayoutDashboard,
  company: Building2,
  location: SlidersHorizontal,
  presence: MapPinned,
};
const groupIcons: Record<PolicySection["group"], LucideIcon> = {
  company: Building2,
  location: MapPin,
  information: Layers3,
};

const copy = {
  en: {
    navigation: "Policy sections",
    sections: "Sections",
    workspace: "Settings workspace",
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
    workspace: "مساحة الإعدادات",
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const previousSection = useRef(activeSection);
  const SelectedIcon = sectionIcons[activeSection] ?? LayoutDashboard;

  useEffect(() => {
    if (previousSection.current !== activeSection) {
      previousSection.current = activeSection;
      document.querySelector<HTMLElement>(".issue321-option-d #p321-current-section")?.focus();
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
            <span className="issue321-option-d__eyebrow"><PanelLeft aria-hidden="true" size={14} />{t.sections}</span>
            <button ref={toggleRef} className="issue321-option-d__mobile-toggle" type="button"
              aria-controls="issue321-option-d-sections" aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(open => !open)}>
              <SelectedIcon aria-hidden="true" size={17} strokeWidth={1.85} />
              <span>{selected?.label ?? t.sections}</span>
              <ChevronDown aria-hidden="true" size={16} className={mobileNavOpen ? "is-open" : undefined} />
            </button>
          </div>

          <nav id="issue321-option-d-sections" aria-label={t.navigation} className="issue321-option-d__nav"
            data-mobile-open={mobileNavOpen} onKeyDown={event => {
              if (event.key === "Escape" && mobileNavOpen) {
                event.preventDefault();
                setMobileNavOpen(false);
                toggleRef.current?.focus();
              }
            }}>
            <ul className="issue321-option-d__nav-list">
              {sections.map((section) => {
                const showGroup = section.group !== previousGroup;
                previousGroup = section.group;
                const Icon = sectionIcons[section.id] ?? LayoutDashboard;
                const GroupIcon = groupIcons[section.group];
                const current = section.id === activeSection;

                return (
                  <li key={section.id} className="issue321-option-d__nav-entry">
                    {showGroup ? (
                      <span className="issue321-option-d__group-label">
                        <GroupIcon aria-hidden="true" size={13} strokeWidth={1.8} />
                        {groupName(section.group)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-current={current ? "page" : undefined}
                      aria-controls="issue321-option-d-selected-pane"
                      className="issue321-option-d__nav-button"
                      onClick={() => {
                        setMobileNavOpen(false);
                        if (!current) onSelect(section.id);
                        else toggleRef.current?.focus();
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
          aria-labelledby={selected ? "p321-current-section" : "issue321-option-d-heading"}
        >
          {selected ? (
            <>
              <div className="issue321-option-d__workspace-caption">
                <span><SlidersHorizontal aria-hidden="true" size={15} strokeWidth={1.8} />{t.workspace}</span>
                {selected.readOnly ? (
                  <span className="issue321-option-d__read-only">{t.readOnly}</span>
                ) : null}
              </div>
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
