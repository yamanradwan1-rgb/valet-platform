import { Building2, ChevronDown, ChevronRight, FolderOpen, MapPin, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PolicySection, PolicyVariantProps } from "../../shared/types/variant";
import "./option-b.css";

const groupOrder = ["company", "location", "information"] as const;

export default function OptionB(props: PolicyVariantProps) {
  const ar = props.locale === "ar";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ company: true, location: true, information: true });
  const [mobileOpen, setMobileOpen] = useState(false);
  const previousSection = useRef(props.activeSection);
  const names = {
    company: ar ? "إعدادات الشركة" : "Company configuration",
    location: ar ? "عمليات الموقع" : "Location operations",
    information: ar ? "المعلومات والمرجع" : "Information & reference",
  };
  const groups = groupOrder.map(group => ({
    id: group,
    items: props.sections.filter(s => s.group === group),
  })).filter(group => group.items.length > 0);

  useEffect(() => {
    const selected = props.sections.find(s => s.id === props.activeSection);
    if (selected) setExpanded(state => ({ ...state, [selected.group]: true }));
    if (previousSection.current !== props.activeSection) {
      previousSection.current = props.activeSection;
      document.getElementById("p321-current-section")?.focus({ preventScroll: true });
    }
  }, [props.activeSection, props.sections]);

  function pick(section: PolicySection) {
    props.onSelect(section.id);
    setMobileOpen(false);
  }

  const active = props.sections.find(s => s.id === props.activeSection);
  if (props.role === "DENIED") return <div className="p321-b-denied" role="alert">
    {ar ? "لا تملك صلاحية عرض هذه الإعدادات." : "Your role cannot view Policies & Settings."}
  </div>;

  return <div className="p321-b">
    <div className="p321-b-mobile-control">
      <button type="button" aria-expanded={mobileOpen} aria-controls="p321-b-rail" onClick={() => setMobileOpen(!mobileOpen)}>
        <FolderOpen aria-hidden="true" size={17} />
        <span>{ar ? "أقسام الإعدادات" : "Settings sections"}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </button>
    </div>
    <aside className={`p321-b-rail ${mobileOpen ? "p321-b-open" : ""}`} id="p321-b-rail">
      <div className="p321-b-rail-intro">
        <span className="p321-b-kicker">{ar ? "مستوى التنقل الثاني" : "Section navigation"}</span>
        <strong>{ar ? "السياسات والإعدادات" : "Policies & Settings"}</strong>
        <small>{ar ? "ضمن المؤسسة المحددة" : "For the selected organization"}</small>
      </div>
      <nav aria-label={ar ? "أقسام السياسات" : "Policy settings sections"}>
        {groups.map(group => <div className="p321-b-group" key={group.id}>
          <button className="p321-b-group-heading" type="button"
            aria-expanded={expanded[group.id] ?? true} aria-controls={`p321-b-${group.id}`}
            onClick={() => setExpanded(old => ({ ...old, [group.id]: !(old[group.id] ?? true) }))}>
            {group.id === "company" ? <Building2 size={15} aria-hidden="true" /> :
              group.id === "location" ? <MapPin size={15} aria-hidden="true" /> : <Settings2 size={15} aria-hidden="true" />}
            <span>{names[group.id]}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <ul className="p321-b-group-items" id={`p321-b-${group.id}`} hidden={!(expanded[group.id] ?? true)}>
            {group.items.map(section => <li key={section.id}>
              <button type="button" className="p321-b-link" aria-current={props.activeSection === section.id ? "page" : undefined}
                onClick={() => pick(section)}>
                <span className="p321-b-link-copy"><strong>{section.label}</strong><small>{section.description}</small></span>
                {section.readOnly ? <span className="p321-b-readonly">{ar ? "عرض" : "View"}</span> : <ChevronRight size={14} aria-hidden="true" />}
              </button>
            </li>)}
          </ul>
        </div>)}
      </nav>
      <div className="p321-b-rail-foot">
        <span>{ar ? "المؤسسة" : "Organization"}</span><bdi>{props.organizationLabel}</bdi>
        <span>{ar ? "الموقع" : "Location"}</span><bdi>{props.locationLabel ?? (ar ? "غير محدد" : "Not selected")}</bdi>
      </div>
    </aside>
    <div className="p321-b-workspace">
      <div className="p321-b-breadcrumb"><span>{ar ? "الإعدادات" : "Settings"}</span><ChevronRight size={14} aria-hidden="true" />
        <span>{active?.label ?? ""}</span></div>
      <div role="status" className="p321-b-sr">{ar ? "القسم المحدد" : "Selected section"}: {active?.label}</div>
      {props.renderPane("grouped")}
    </div>
  </div>;
}
