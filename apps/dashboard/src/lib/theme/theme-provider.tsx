"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  commitDashboardTheme,
  DASHBOARD_THEME_EVENT,
  readDashboardTheme,
  type DashboardTheme,
} from "./theme";

interface ThemeContextValue {
  readonly theme: DashboardTheme;
  readonly setTheme: (theme: DashboardTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", callback);
  window.addEventListener(DASHBOARD_THEME_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(DASHBOARD_THEME_EVENT, callback);
  };
}

function serverThemeSnapshot(): DashboardTheme {
  return "light";
}

export function DashboardThemeProvider({ children }: { readonly children: ReactNode }) {
  const theme = useSyncExternalStore<DashboardTheme>(
    subscribe,
    readDashboardTheme,
    serverThemeSnapshot,
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const setTheme = useCallback((next: DashboardTheme) => commitDashboardTheme(next), []);
  const value = useMemo(() => ({ setTheme, theme }), [setTheme, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useDashboardTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useDashboardTheme requires DashboardThemeProvider");
  return value;
}
