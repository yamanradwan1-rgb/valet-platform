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
  commitThemeChange,
  DEFAULT_THEME,
  getPersistedTheme,
  THEME_CHANGE_EVENT,
  THEME_COLORS,
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
  window.addEventListener('storage', callback);
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
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
      document.documentElement.setAttribute('data-theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', THEME_COLORS[theme]);
      }
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
