import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, LockKeyhole } from "lucide-react";
import { ReferenceAdministrationPage } from "../../../../features/administration/reference-administration-page";
import { ContextHelp } from "../../../../features/help/context-help";
import { Button } from "../../../../components/presentation/button";
import { availableSections, sectionCopy, visibleFields } from "./catalog";
import { FieldList } from "./FieldList";
import { HoursPane } from "./HoursPane";
import { ZonesPane } from "./ZonesPane";
import { WhatsAppPane } from "./WhatsAppPane";
import { ReadState } from "./ReadState";
import { useStudio } from "./studio-context";
import { ui } from "./copy";
import { SettingsScope } from "./SettingsScope";
import { sectionGuidance } from "./setting-guidance";
import { SectionIcon } from "./SectionIcon";
import { PresenceReadiness } from "./PresenceReadiness";

export function Workspace() {
  const studio = useStudio();
  const { route, locale, identity, navigate, notice, adapter } = studio;
  const copy = ui[locale];
  const ar = locale === "ar";
  const [navOpen, setNavOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const sections = availableSections(route.role, route.scope);
  const section = sectionCopy[route.section];
  const denied = route.role === "DENIED" || route.scenario === "denied";
  const readonly =
    adapter.presence.readState === "READ_ONLY" &&
    ["presence", "zones"].includes(route.section);
  const hint =
    route.section === "zones"
      ? ar
        ? "تُحفظ مناطق الحضور على مستوى الموقع فقط."
        : "Attendance zones are saved at location scope only."
      : route.scope === "company"
        ? copy.companyNote
        : copy.locationNote;
  return (
    <div className="ps-workspace">
      <ReferenceAdministrationPage
        title={ar ? "السياسات والإعدادات" : "Policies & Settings"}
        subtitle={copy.subtitle}
        subtitleSize="sm"
        subtitleMargin="half"
        action={
          <ContextHelp
            helpKey="policies.page"
            locale={locale}
            scopeIdentity={identity}
          />
        }
      >
        {denied ? (
          <ReadState />
        ) : (
          <>
            <SettingsScope />
            <div className="ps-layout">
              <aside
                className="ps-section-index"
                onKeyDown={(event) => {
                  if (event.key === "Escape" && navOpen) {
                    setNavOpen(false);
                    toggle.current?.focus();
                  }
                }}
              >
                <div className="ps-index-label">
                  {ar ? "الإعدادات" : "Configuration"}
                </div>
                <button
                  className="ps-mobile-index"
                  ref={toggle}
                  type="button"
                  aria-expanded={navOpen}
                  aria-controls="ps-section-links"
                  onClick={() => setNavOpen(!navOpen)}
                >
                  <SectionIcon section={route.section} />
                  <span>{section[locale]}</span>
                  <ChevronDown size={17} aria-hidden="true" />
                </button>
                <nav
                  id="ps-section-links"
                  className="ps-section-links"
                  data-open={navOpen}
                  aria-label={copy.sections}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setNavOpen(false);
                      toggle.current?.focus();
                    }
                  }}
                >
                  {sections.map((id) => (
                    <a
                      key={id}
                      href={`/policies?section=${id}`}
                      aria-label={sectionCopy[id][locale]}
                      aria-current={id === route.section ? "page" : undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setNavOpen(false);
                        navigate({ section: id });
                      }}
                    >
                      <SectionIcon section={id} />
                      <span className="ps-nav-copy">
                        <strong>{sectionCopy[id][locale]}</strong>
                        <small>{sectionGuidance[id][ar ? 1 : 0]}</small>
                      </span>
                      {id === route.section ? (
                        <ChevronRight
                          className="ps-chevron"
                          size={15}
                          aria-hidden="true"
                        />
                      ) : null}
                    </a>
                  ))}
                </nav>
              </aside>
              <section className="ps-pane" aria-labelledby="studio-heading">
                <header className="ps-pane-header">
                  <div>
                    <div className="ps-overline">
                      {route.scope === "company" ? copy.company : copy.location}
                    </div>
                    <h2 id="studio-heading" tabIndex={-1}>
                      {section[locale]}
                    </h2>
                    <p>{section.hint[ar ? 1 : 0]}</p>
                  </div>
                  <ContextHelp
                    helpKey={
                      route.scope === "location" &&
                      section.help === "policies.company"
                        ? "policies.location"
                        : section.help
                    }
                    locale={locale}
                    scopeIdentity={identity}
                  />
                </header>
                {
                  <div className="ps-scope-note">
                    {readonly ? (
                      <LockKeyhole size={15} aria-hidden="true" />
                    ) : null}
                    <span>{readonly ? copy.readNote : hint}</span>
                  </div>
                }
                <div className="ps-pane-body">
                  <ReadState>
                    {route.section === "hours" ? (
                      <HoursPane key={identity} />
                    ) : null}
                    {route.section === "zones" ? (
                      <ZonesPane key={identity} />
                    ) : null}
                    {route.section === "presence" ? (
                      <>
                        <PresenceReadiness />
                        <p className="ps-inline-note">
                          {ar
                            ? "التحقق لحظة بدء أو إنهاء المناوبة فقط. لا تُحفظ إحداثيات الموظف الخام."
                            : "A check at Start or End only. Raw employee coordinates are not retained."}
                        </p>
                      </>
                    ) : null}
                    {route.section === "whatsapp" ? (
                      <WhatsAppPane key={identity} />
                    ) : null}
                    {!["hours", "whatsapp"].includes(route.section) && (
                      <FieldList
                        key={`${identity}:fields`}
                        fields={visibleFields(
                          route.section,
                          route.role,
                          route.scope,
                        ).filter((field) =>
                          field.section === "presence"
                            ? adapter.presence.availableKeys.includes(field.key)
                            : adapter.settings.availableKeys.includes(
                                field.key,
                              ),
                        )}
                      />
                    )}
                    {route.section === "presence" &&
                    route.scope === "location" ? (
                      <div className="ps-related">
                        <div>
                          <strong>
                            {ar ? "مناطق الحضور" : "Attendance zones"}
                          </strong>
                          <p>
                            {ar
                              ? "راجع مناطق هذا الموقع قبل اختيار وضع إلزامي."
                              : "Review this location’s zones before selecting a strict mode."}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => navigate({ section: "zones" })}
                        >
                          {ar ? "عرض المناطق" : "View zones"}
                        </Button>
                      </div>
                    ) : null}
                  </ReadState>
                </div>
                <div className="ps-notice" role="status" aria-live="polite">
                  {notice}
                </div>
              </section>
            </div>
          </>
        )}
      </ReferenceAdministrationPage>
    </div>
  );
}
