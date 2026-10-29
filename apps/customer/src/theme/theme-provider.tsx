'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import {
  applyThemeToDom,
  commitThemeChange,
  DEFAULT_THEME,
  getPersistedTheme,
  shouldSkipInitialThemeSync,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  syncThemeFromStorage,
  type Theme,
} from './theme';

export interface ThemeContextValue {
  readonly theme: Theme;
  readonly isDark: boolean;
  readonly setTheme: (theme: Theme) => void;
  readonly toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeToTheme(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    syncThemeFromStorage(event.newValue);
    callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
  };
}

function getClientThemeSnapshot(): Theme {
  return getPersistedTheme();
}

function getServerThemeSnapshot(): Theme {
  return DEFAULT_THEME;
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  readonly children: React.ReactNode;
  readonly initialTheme?: Theme | undefined;
}) {
  const storeTheme = useSyncExternalStore(
    subscribeToTheme,
    getClientThemeSnapshot,
    getServerThemeSnapshot,
  );

  const theme: Theme = initialTheme ?? storeTheme;
  const isDark = theme === 'dark';

  // Synchronize document attributes on client mount / theme changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const domTheme = document.documentElement.getAttribute('data-theme');
      // Do not allow initial 'light' SSR snapshot to clobber pre-hydrated 'dark' DOM
      if (shouldSkipInitialThemeSync(domTheme, theme)) {
        return;
      }
      applyThemeToDom(theme);
    }
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    commitThemeChange(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme: Theme = theme === 'light' ? 'dark' : 'light';
    commitThemeChange(nextTheme);
  }, [theme]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark,
      setTheme,
      toggleTheme,
    }),
    [theme, isDark, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
