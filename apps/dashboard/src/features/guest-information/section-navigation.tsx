import { translate } from "./approved-elements";
import type { GuestLanguage } from "./guest-information-model";

export type GuestInformationView = "overview" | "privacy" | "contact";

function SectionIcon({ section }: { readonly section: GuestInformationView }) {
  return (
    <svg className="opt2-icon" viewBox="0 0 24 24" aria-hidden="true">
      {section === "overview" ? (
        <>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </>
      ) : section === "privacy" ? (
        <>
          <path d="M12 2.5 20 6v5.5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z" />
          <path d="m9 12 2 2 4-4" />
        </>
      ) : (
        <path d="M4 6h16v12H4zM7 10h10M7 14h6" />
      )}
    </svg>
  );
}

const views = [
  { value: "overview", name: ["Overview", "نظرة عامة"], caption: ["Current status", "الحالة الحالية"] },
  { value: "privacy", name: ["Privacy", "الخصوصية"], caption: ["Location policy", "سياسة الموقع"] },
  { value: "contact", name: ["Contact", "التواصل"], caption: ["Company and location", "الشركة والموقع"] },
] as const;

export function GuestSectionNavigation({
  locale, active, onSelect,
}: {
  readonly locale: GuestLanguage;
  readonly active: GuestInformationView;
  readonly onSelect: (view: GuestInformationView) => void;
}) {
  return (
    <aside className="opt2-side" aria-label={translate(locale,
      "Settings sections", "أقسام الإعدادات")}>
      <div className="opt2-side-label">
        {translate(locale, "On this page", "في هذه الصفحة")}
      </div>
      <nav className="opt2-nav" aria-label={translate(locale,
        "Guest information sections", "أقسام معلومات الضيف")}>
        {views.map((item) => (
          <button key={item.value} type="button"
            data-view-target={item.value} aria-controls={`opt2-${item.value}`}
            aria-current={active === item.value ? "page" : undefined}
            aria-pressed={active === item.value}
            onClick={() => onSelect(item.value)}>
            <SectionIcon section={item.value} />
            <span>
              <span className="opt2-nav-name">{translate(locale, item.name[0], item.name[1])}</span>
              <span className="opt2-nav-caption">{translate(locale, item.caption[0], item.caption[1])}</span>
            </span>
          </button>
        ))}
      </nav>
      <p className="opt2-nav-hint">
        {translate(locale, "Scroll for more sections ↔", "مرّر لعرض بقية الأقسام ↔")}
      </p>
    </aside>
  );
}
