import type { ReactNode } from "react";
import { LoaderCircle, MapPin, ShieldOff, CloudOff, Inbox } from "lucide-react";
import { Button } from "../../../../components/presentation/button";
import { useStudio } from "./studio-context";
import { ui } from "./copy";

export function ReadState({ children }: { children?: ReactNode }) {
  const { route, locale, adapter } = useStudio();
  const copy = ui[locale];
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
  if (route.role === "DENIED" || scenario === "denied")
    return (
      <div className="ps-state" role="alert">
        <ShieldOff size={28} aria-hidden="true" />
        <h2 id="studio-heading" tabIndex={-1}>
          {copy.denied}
        </h2>
        <p>{copy.deniedBody}</p>
      </div>
    );
  if (route.scope === "location" && route.location === "none")
    return (
      <div className="ps-state" role="status">
        <MapPin size={28} aria-hidden="true" />
        <h3>{copy.noLocation}</h3>
        <p>{copy.noLocationBody}</p>
      </div>
    );
  if (scenario === "loading")
    return (
      <div className="ps-state" role="status" aria-busy="true">
        <LoaderCircle size={25} aria-hidden="true" />
        <h3>{copy.loading}</h3>
        <div className="ps-skeleton" />
        <div className="ps-skeleton" />
        <Button variant="secondary" onClick={() => void adapter.reload()}>
          {locale === "ar" ? "إعادة التحميل" : "Reload"}
        </Button>
      </div>
    );
  if (scenario === "error")
    return (
      <div className="ps-state" role="alert">
        <CloudOff size={28} aria-hidden="true" />
        <h3>{copy.error}</h3>
        <p>{adapter.error ?? sectionError ?? copy.errorBody}</p>
        <Button variant="secondary" onClick={() => void adapter.reload()}>
          {copy.retry}
        </Button>
      </div>
    );
  if (scenario === "empty")
    return (
      <div className="ps-state" role="status">
        <Inbox size={28} aria-hidden="true" />
        <h3>{copy.empty}</h3>
        <p>{copy.emptyBody}</p>
      </div>
    );
  return <>{children}</>;
}
