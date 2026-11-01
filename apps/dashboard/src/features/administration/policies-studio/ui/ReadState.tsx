import { Fragment, type ReactNode } from "react";
import { LoaderCircle, MapPin, ShieldOff, CloudOff, Inbox } from "lucide-react";
import { Button } from "../../../../components/presentation/button";
import { useStudio } from "./studio-context";
import { ui } from "./copy";

export function ReadState({ children }: { children?: ReactNode }) {
  const { route, locale, adapter, dirty } = useStudio();
  const copy = ui[locale];
  const presenceSection = ["presence", "zones"].includes(route.section);
  const presenceState = adapter.presence.readState;
  const sectionLoading =
    route.section === "presence" || route.section === "zones"
      ? adapter.presence.loading
      : route.section === "whatsapp"
        ? adapter.whatsapp.loading
        : false;
  const sectionError =
    route.section === "presence" || route.section === "zones"
      ? adapter.presence.error
      : route.section === "whatsapp"
        ? adapter.whatsapp.error
        : null;
  const independentSection = ["presence", "zones", "whatsapp"].includes(
    route.section,
  );
  const scenario = independentSection
    ? sectionLoading
      ? "loading"
      : sectionError
        ? "error"
        : "ready"
    : route.scenario !== "ready"
      ? route.scenario
      : sectionLoading
        ? "loading"
        : sectionError
          ? "error"
          : "ready";
  if (
    route.role === "DENIED" ||
    scenario === "denied" ||
    (presenceSection && presenceState === "DENIED")
  )
    return (
      <div className="ps-state" role="alert">
        <ShieldOff size={28} aria-hidden="true" />
        <h2 id="studio-heading" tabIndex={-1}>
          {copy.denied}
        </h2>
        <p>{copy.deniedBody}</p>
      </div>
    );
  if (
    (route.scope === "location" && route.location === "none") ||
    (presenceSection && presenceState === "NO_LOCATION")
  )
    return (
      <div className="ps-state" role="status">
        <MapPin size={28} aria-hidden="true" />
        <h3>{copy.noLocation}</h3>
        <p>{copy.noLocationBody}</p>
      </div>
    );
  if (presenceSection && presenceState === "INACTIVE")
    return (
      <div className="ps-state" role="status">
        <p>
          {locale === "ar"
            ? "إعدادات الحضور غير متاحة لموقع غير نشط."
            : "Attendance settings are unavailable for an inactive Location."}
        </p>
      </div>
    );
  if (scenario === "loading")
    return (
      <>
        <div className="ps-state" role="status" aria-busy="true">
          <LoaderCircle size={25} aria-hidden="true" />
          <h3>{copy.loading}</h3>
          <div className="ps-skeleton" />
          <div className="ps-skeleton" />
          <Button variant="secondary" onClick={() => void adapter.reload()}>
            {locale === "ar" ? "إعادة التحميل" : "Reload"}
          </Button>
        </div>
        {dirty ? <Fragment key="content">{children}</Fragment> : null}
      </>
    );
  if (scenario === "error")
    return (
      <>
        <div className="ps-state" role="alert">
          <CloudOff size={28} aria-hidden="true" />
          <h3>{copy.error}</h3>
          <p>{sectionError ?? adapter.error ?? copy.errorBody}</p>
          <Button variant="secondary" onClick={() => void adapter.reload()}>
            {copy.retry}
          </Button>
        </div>
        {dirty ? <Fragment key="content">{children}</Fragment> : null}
      </>
    );
  if (scenario === "empty")
    return (
      <div className="ps-state" role="status">
        <Inbox size={28} aria-hidden="true" />
        <h3>{copy.empty}</h3>
        <p>{copy.emptyBody}</p>
      </div>
    );
  return (
    <>
      <Fragment key="content">{children}</Fragment>
    </>
  );
}
