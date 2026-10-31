import type { ReactNode } from "react";
import { LoaderCircle, MapPin, ShieldOff, CloudOff, Inbox } from "lucide-react";
import { Button } from "@dashboard/components/presentation/button";
import { useStudio } from "./studio-context";
import { ui } from "./copy";

export function ReadState({ children }: { children?: ReactNode }) {
  const { route, locale, navigate } = useStudio();
  const copy = ui[locale];
  if (route.role === "DENIED" || route.scenario === "denied")
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
  if (route.scenario === "loading")
    return (
      <div className="ps-state" role="status" aria-busy="true">
        <LoaderCircle size={25} aria-hidden="true" />
        <h3>{copy.loading}</h3>
        <div className="ps-skeleton" />
        <div className="ps-skeleton" />
        <Button
          variant="secondary"
          onClick={() => navigate({ scenario: "ready" })}
        >
          {locale === "ar"
            ? "إكمال التحميل التجريبي"
            : "Complete simulated load"}
        </Button>
      </div>
    );
  if (route.scenario === "error")
    return (
      <div className="ps-state" role="alert">
        <CloudOff size={28} aria-hidden="true" />
        <h3>{copy.error}</h3>
        <p>{copy.errorBody}</p>
        <Button
          variant="secondary"
          onClick={() => navigate({ scenario: "ready" })}
        >
          {copy.retry}
        </Button>
      </div>
    );
  if (route.scenario === "empty")
    return (
      <div className="ps-state" role="status">
        <Inbox size={28} aria-hidden="true" />
        <h3>{copy.empty}</h3>
        <p>{copy.emptyBody}</p>
      </div>
    );
  return <>{children}</>;
}
