"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Scalar, Section } from "./catalog";
import { availableSections } from "./catalog";
import type {
  PoliciesStudioAdapter,
  StudioRoute,
  StudioSaveResult,
} from "./studio-types";
import { StudioProvider } from "./studio-context";
import { Workspace } from "./Workspace";
import { ui } from "./copy";
import "./workspace.css";
import "./workspace-feedback.css";
import "./responsive.css";
import "./editors.css";
import "./zone-map.css";
import "./usability.css";

export type { PoliciesStudioAdapter, StudioSaveResult } from "./studio-types";

function sectionFromUrl(
  allowed: readonly Section[],
  fallback: Section,
): Section {
  if (typeof window === "undefined") return fallback;
  const candidate = new URLSearchParams(window.location.search).get("section");
  return allowed.includes(candidate as Section)
    ? (candidate as Section)
    : fallback;
}

function updateSectionUrl(section: Section, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("section", section);
  if (replace) window.history.replaceState(window.history.state, "", url);
  else window.history.pushState(window.history.state, "", url);
}

export function PoliciesStudioView({
  adapter,
}: {
  readonly adapter: PoliciesStudioAdapter;
}) {
  const initialSection =
    availableSections(adapter.role, adapter.scope)[0] ?? "operations";
  const [section, setSection] = useState<Section>(() =>
    sectionFromUrl(
      availableSections(adapter.role, adapter.scope),
      initialSection,
    ),
  );
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [setting, setSetting] = useState<string | null>(null);
  const valid = availableSections(adapter.role, adapter.scope);
  const currentSection = valid.includes(section)
    ? section
    : (valid[0] ?? "operations");
  const live = useRef({ dirty, section: currentSection });
  const focusedRoute = useRef<string | null>(null);
  const route: StudioRoute = useMemo(
    () => ({
      section: currentSection,
      scope: adapter.scope,
      role: adapter.role,
      org: adapter.organization.id,
      location: adapter.location?.id ?? "none",
      scenario: adapter.status,
      setting,
    }),
    [
      currentSection,
      adapter.scope,
      adapter.role,
      adapter.organization.id,
      adapter.location?.id,
      adapter.status,
      setting,
    ],
  );
  const identity = [
    route.org,
    route.location,
    route.scope,
    route.role,
    route.section,
  ].join(":");

  useEffect(() => {
    live.current = { dirty, section: currentSection };
  }, [dirty, currentSection]);

  useEffect(() => {
    const allowed = availableSections(adapter.role, adapter.scope);
    const fallback = allowed[0] ?? "operations";
    const current = sectionFromUrl(allowed, fallback);
    if (new URLSearchParams(window.location.search).get("section") !== current)
      updateSectionUrl(current, true);
    function pop() {
      const target = sectionFromUrl(allowed, fallback);
      if (target === live.current.section) return;
      if (live.current.dirty && !window.confirm(ui[adapter.locale].leave)) {
        updateSectionUrl(live.current.section);
        return;
      }
      setDirty(false);
      setNotice("");
      setSection(target);
    }
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [adapter.role, adapter.scope, adapter.locale]);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    // The shell owns scope selection. Intercept its user-triggered controls
    // without changing the shared shell or overriding security revocations.
    function protectDraft(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const changingScope = event.target.closest(
        ".sidebar-scope, .location-context:not([aria-haspopup='listbox']), " +
          "[data-testid='location-switch-menu'] [role='option']",
      );
      const leavingPage = event.target.closest(
        ".sidebar-navigation a, .sidebar-utilities a",
      );
      if (!changingScope && !leavingPage) return;
      if (window.confirm(ui[adapter.locale].leave)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    document.addEventListener("click", protectDraft, true);
    return () => document.removeEventListener("click", protectDraft, true);
  }, [dirty, adapter.locale]);

  useEffect(() => {
    const focusKey = `${identity}:${route.setting ?? ""}`;
    if (live.current.dirty || focusedRoute.current === focusKey) return;
    const frame = requestAnimationFrame(() => {
      const target = route.setting
        ? document.querySelector<HTMLElement>(
            `[data-setting="${route.setting}"]`,
          )
        : null;
      if (!target) {
        document
          .getElementById("studio-heading")
          ?.focus({ preventScroll: true });
        if (!route.setting) focusedRoute.current = focusKey;
        return;
      }
      target.scrollIntoView({ block: "center" });
      const button = target.querySelector<HTMLButtonElement>(".ps-edit-button");
      if (button) button.focus({ preventScroll: true });
      else target.focus({ preventScroll: true });
      focusedRoute.current = focusKey;
    });
    return () => cancelAnimationFrame(frame);
  }, [route.setting, identity, adapter.status]);

  function navigate(patch: Partial<StudioRoute>) {
    const nextScope = patch.scope ?? route.scope;
    const nextSection = patch.section ?? route.section;
    if (nextScope === route.scope && nextSection === route.section) return;
    if (dirty && !window.confirm(ui[adapter.locale].leave)) return;
    setDirty(false);
    setNotice("");
    setSetting(null);
    if (patch.scope && patch.scope !== route.scope)
      adapter.onScopeChange(patch.scope);
    if (patch.section) {
      const allowed = availableSections(adapter.role, nextScope);
      if (allowed.includes(patch.section)) {
        updateSectionUrl(patch.section);
        setSection(patch.section);
      }
    }
  }

  async function save(
    key: string,
    value: Scalar,
    clear = false,
    strictConfirmed = false,
  ): Promise<StudioSaveResult> {
    const result = key.startsWith("shift")
      ? await adapter.presence.savePolicy(key, value, clear, strictConfirmed)
      : clear
        ? await adapter.settings.clear(key)
        : await adapter.settings.save(key, value);
    if (result.ok) {
      setDirty(false);
      setNotice(adapter.locale === "ar" ? "تم حفظ الإعداد." : "Setting saved.");
    }
    return result;
  }

  const independentSection = ["presence", "zones", "whatsapp"].includes(
    currentSection,
  );
  const editable =
    (adapter.status === "ready" || independentSection) &&
    (currentSection === "zones"
      ? adapter.presence.zonesEditable
      : currentSection === "presence"
        ? adapter.presence.editable
        : currentSection === "hours"
          ? adapter.hours.editable
          : currentSection === "whatsapp"
            ? adapter.whatsapp.editable
            : adapter.settings.editableKeys.length > 0);
  return (
    <StudioProvider
      value={{
        route,
        locale: adapter.locale,
        adapter,
        identity,
        editable,
        dirty,
        setDirty,
        save,
        navigate,
        notice,
        announce: setNotice,
      }}
    >
      <Workspace />
    </StudioProvider>
  );
}
