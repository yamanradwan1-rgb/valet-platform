import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "../features/auth/auth-provider";
import { LocaleProvider } from "../i18n/locale-provider";
import { ThemeProvider } from "../theme/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "VAYLET Management Dashboard",
  description:
    "Digital operating system for valet operations - Management Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" dir="ltr" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Tajawal:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <LocaleProvider>
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
