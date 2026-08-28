"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { useTranslation } from "../../i18n/locale-provider";
import {
  MOBILE_NAVIGATION_DRAWER_ID,
  MobileNavigationDrawer,
} from "./mobile-navigation-drawer";
import { DesktopSidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/**
 * D1 dashboard shell: fixed sidebar (drawer on mobile), top bar with location
 * context, theme and language controls, scrollable main region. The shell is
 * direction-agnostic; RTL/LTR behavior follows the document `dir` set by the
 * locale provider using logical CSS properties.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [previousPathname, setPreviousPathname] = useState(pathname);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);
  const { t } = useTranslation();

  if (pathname !== previousPathname) {
    setPreviousPathname(pathname);
    if (mobileNavOpen) setMobileNavOpen(false);
  }

  const closeMobileNav = useCallback((restoreFocus: boolean) => {
    restoreFocusRef.current = restoreFocus;
    setMobileNavOpen(false);
  }, []);

  const openMobileNav = useCallback(() => {
    restoreFocusRef.current = true;
    setMobileNavOpen(true);
  }, []);

  const shouldRestoreMobileFocus = useCallback(
    () => restoreFocusRef.current,
    [],
  );

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeMobileNav(false);
    };
    desktop.addEventListener("change", onBreakpointChange);
    return () => desktop.removeEventListener("change", onBreakpointChange);
  }, [closeMobileNav]);

  return (
    <div className="dashboard-shell">
      <DesktopSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
      />
      <div className="dashboard-main-column">
        <TopBar
          menuButtonRef={menuButtonRef}
          mobileNavOpen={mobileNavOpen}
          mobileNavControls={MOBILE_NAVIGATION_DRAWER_ID}
          onMenuToggle={openMobileNav}
        />
        <main
          ref={mainRef}
          id="main-content"
          className="dashboard-main"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
      <span
        aria-hidden="true"
        data-testid="shell-ready"
        style={{ display: "none" }}
      >
        {t("shell.appName")}
      </span>
      {mobileNavOpen ? (
        <MobileNavigationDrawer
          triggerRef={menuButtonRef}
          mainRef={mainRef}
          openedPathname={previousPathname}
          shouldRestoreFocus={shouldRestoreMobileFocus}
          onRequestClose={closeMobileNav}
        />
      ) : null}
    </div>
  );
}
