import { useEffect, useRef, useState } from "react";
import {
  availableSections,
  visibleFields,
  type Role,
  type Scope,
  type Section,
} from "./catalog";

export interface PreviewRoute {
  path: string;
  section: Section;
  scope: Scope;
  org: string;
  location: string;
  role: Role;
  scenario: string;
  setting: string | null;
}
export function readRoute(): PreviewRoute {
  const url = new URL(location.href);
  const p = url.searchParams;
  const role: Role =
    p.get("role") === "LOCATION_MANAGER"
      ? "LOCATION_MANAGER"
      : p.get("role") === "DENIED"
        ? "DENIED"
        : "COMPANY_ADMIN";
  const scope =
    role === "LOCATION_MANAGER" || p.get("scope") === "location"
      ? "location"
      : "company";
  const valid = availableSections(role, scope);
  const candidate = p.get("tab") === "services" ? "services" : p.get("section");
  const section = valid.includes(candidate as Section)
    ? (candidate as Section)
    : (valid[0] ?? "operations");
  return {
    path: url.pathname,
    section,
    scope,
    role,
    setting:
      visibleFields(section, role, scope).some(
        (field) => field.key === p.get("setting"),
      ) && role !== "DENIED"
        ? p.get("setting")
        : null,
    org: p.get("org") === "demo-valet" ? "demo-valet" : "demo-hospitality",
    location: ["garden", "marina", "none"].includes(p.get("location") || "")
      ? p.get("location")!
      : "garden",
    scenario: ["loading", "empty", "error", "denied", "readonly"].includes(
      p.get("scenario") || "",
    )
      ? p.get("scenario")!
      : "ready",
  };
}
export function routeUrl(route: PreviewRoute) {
  const p = new URLSearchParams({
    section: route.section,
    scope: route.scope,
    org: route.org,
    location: route.location,
    role: route.role,
    scenario: route.scenario,
  });
  if (route.setting) p.set("setting", route.setting);
  return `${route.path}?${p}`;
}
export function usePreviewRoute(dirty: boolean, discard: () => void) {
  const [route, setRoute] = useState(readRoute);
  const [pending, setPending] = useState<PreviewRoute | null>(null);
  const index = useRef(0);
  const restoring = useRef(false);
  const live = useRef({ dirty, discard });
  live.current = { dirty, discard };
  useEffect(() => {
    history.replaceState({ studioIndex: 0 }, "", routeUrl(readRoute()));
    function pop() {
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      const nextIndex = history.state?.studioIndex ?? 0;
      if (
        live.current.dirty &&
        !window.confirm(
          document.documentElement.lang === "ar"
            ? "تجاهل التغييرات غير المحفوظة؟"
            : "Discard unsaved changes?",
        )
      ) {
        restoring.current = true;
        history.go(index.current - nextIndex);
        return;
      }
      live.current.discard();
      index.current = nextIndex;
      setRoute(readRoute());
    }
    function unload(event: BeforeUnloadEvent) {
      if (!live.current.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("popstate", pop);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  function commit(next: PreviewRoute) {
    live.current.discard();
    history.pushState({ studioIndex: ++index.current }, "", routeUrl(next));
    setRoute(readRoute());
  }
  function navigate(patch: Partial<PreviewRoute>) {
    const next = { ...route, setting: null, ...patch };
    if (routeUrl(next) === routeUrl(route)) return;
    if (dirty) setPending(next);
    else commit(next);
  }
  return {
    route,
    navigate,
    pending,
    cancel: () => setPending(null),
    confirm: () => {
      if (pending) commit(pending);
      setPending(null);
    },
  };
}
