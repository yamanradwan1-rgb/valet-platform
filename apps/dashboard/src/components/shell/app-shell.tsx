"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useTranslation } from "../../i18n/locale-provider";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/**
 * D1 dashboard shell: fixed sidebar (drawer on mobile), top bar with location
 * context, theme and language controls, scrollable main region. The shell is
 * direction-agnostic; RTL/LTR behavior follows the document `dir` set by the
 * locale provider using logical CSS properties.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { t } = useTranslation();
  const pathname = usePathname();

  // Close the mobile drawer when the route changes (render-time adjustment
  // of state derived from navigation, per React's recommended pattern).
  const [prevPathname, setPrevPathname] = useState<string | null>(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (mobileNavOpen) setMobileNavOpen(false);
  }

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  return (
    <div className="dashboard-shell">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="dashboard-main-column">
        <TopBar onMenuToggle={() => setMobileNavOpen(true)} />
        <main id="main-content" className="dashboard-main">
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
    </div>
  );
}
