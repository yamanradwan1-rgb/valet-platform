import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { LocaleProvider } from '../i18n/locale-provider';
import { ThemeProvider } from '../theme/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'VAYLET Guest',
  description: 'Digital operating system for valet operations - Guest Experience',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

const initBootstrapScript = `
(function(){
  try {
    // 1. Locale pre-hydration setup
    var l = localStorage.getItem('vaylet_guest_locale');
    if (l === 'ar') {
      document.documentElement.lang = 'ar';
      document.documentElement.dir = 'rtl';
      document.documentElement.classList.add('vaylet-persisted-ar');
    } else {
      document.documentElement.lang = 'en';
      document.documentElement.dir = 'ltr';
    }

    // 2. Theme pre-hydration setup
    var t = localStorage.getItem('vaylet_guest_theme');
    var isDark = t === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    var meta = document.getElementById('vaylet-theme-color') || document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#07111F' : '#FAFAF8');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" dir="ltr" data-theme="light" suppressHydrationWarning>
      <head>
        <meta id="vaylet-theme-color" name="theme-color" content="#FAFAF8" />
        <script dangerouslySetInnerHTML={{ __html: initBootstrapScript }} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <LocaleProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
