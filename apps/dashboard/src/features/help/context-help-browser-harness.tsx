// Isolated browser mount for the Vitest/Playwright tests. No production route.
import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FocusDialog } from "../../components/presentation/focus-dialog";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { ContextHelp } from "./context-help";

interface Counters {
  submit: number;
  parentClose: number;
  request: number;
  geolocation: number;
  navigation: number;
}

declare global {
  interface Window {
    helpCounters: Counters;
  }
}

window.helpCounters = {
  submit: 0,
  parentClose: 0,
  request: 0,
  geolocation: 0,
  navigation: 0,
};
window.fetch = async () => {
  window.helpCounters.request += 1;
  throw new Error("Unexpected network access");
};
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition: () => {
      window.helpCounters.geolocation += 1;
      throw new Error("Unexpected geolocation");
    },
  },
});

function BrowserHarness() {
  const [locale, setLocale] = useState<DashboardLocale>("en");
  const [scope, setScope] = useState("organization-a/location-a/session-a");
  const [shown, setShown] = useState(true);
  const [nested, setNested] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [draft, setDraft] = useState("unsaved value");
  const [parentDraft, setParentDraft] = useState("parent draft");
  const pageHeading = useRef<HTMLHeadingElement>(null);

  return (
    <main>
      <h1 ref={pageHeading} tabIndex={-1}>Existing page</h1>
      <nav aria-label="Test navigation">
        <button onClick={() => setLocale("ar")} type="button" data-test="arabic">Arabic</button>
        <button onClick={() => setLocale("en")} type="button" data-test="english">English</button>
        <button onClick={() => setScope("organization-b/location-b/session-b")} type="button" data-test="scope-b">Scope B</button>
        <button onClick={() => setScope("organization-a/location-a/session-a")} type="button" data-test="scope-a">Scope A</button>
        <button onClick={() => setShown(false)} type="button" data-test="unmount">Unmount help</button>
        <button onClick={() => setShown(true)} type="button" data-test="mount">Mount help</button>
        <button onClick={() => setNested(true)} type="button" data-test="nested-mode">Nested mode</button>
        <button onClick={() => setNested(false)} type="button" data-test="normal-mode">Normal mode</button>
        <button onClick={() => setParentOpen(true)} type="button" data-test="open-parent">Open parent</button>
      </nav>
      {!nested ? (
        <form onSubmit={(event) => { event.preventDefault(); window.helpCounters.submit += 1; }}>
          <label htmlFor="draft">Draft</label>
          <input id="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
          {shown ? (
            <>
              <ContextHelp
                helpKey="setting.rawGpsRetentionDays"
                locale={locale}
                scopeIdentity={scope}
                returnFocusFallbackRef={pageHeading}
              />
              <ContextHelp
                helpKey="vehicles.page"
                locale={locale}
                scopeIdentity={scope}
                returnFocusFallbackRef={pageHeading}
              />
              <div data-test="transformed-help-host" style={{ transform: "translateY(-50%)", overflow: "hidden", width: 32 }}>
                <ContextHelp
                  helpKey="tasks.table"
                  locale={locale}
                  scopeIdentity={scope}
                  returnFocusFallbackRef={pageHeading}
                />
              </div>
            </>
          ) : null}
          <button type="submit" data-test="submit">Save</button>
        </form>
      ) : null}
      {parentOpen ? (
        <FocusDialog
          label="Parent editor"
          onClose={() => { window.helpCounters.parentClose += 1; setParentOpen(false); }}
        >
          <h2>Parent editor</h2>
          <label htmlFor="parent-draft">Parent draft</label>
          <input
            id="parent-draft"
            value={parentDraft}
            onChange={(event) => setParentDraft(event.target.value)}
          />
          {shown ? (
            <div data-test="transformed-parent-help" style={{ transform: "translateY(-50%)", overflow: "hidden", width: 32 }}>
              <ContextHelp
                helpKey="live.sessionDetail"
                locale={locale}
                scopeIdentity={scope}
                returnFocusFallbackRef={pageHeading}
              />
            </div>
          ) : null}
          <button type="button" data-test="parent-close"
            onClick={() => { window.helpCounters.parentClose += 1; setParentOpen(false); }}>
            Close parent
          </button>
        </FocusDialog>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserHarness /></StrictMode>,
);
