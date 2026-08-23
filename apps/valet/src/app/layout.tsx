import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import {
  isEmployeeLocale,
  localeDir,
  LOCALE_COOKIE,
} from "../lib/i18n/dictionary";

import "./globals.css";

export const metadata: Metadata = {
  title: "VAYLET — Valet Operations",
  description: "VAYLET Digital Operating System for Valet Operations",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isEmployeeLocale(raw) ? raw : "en";

  return (
    <html lang={locale} dir={localeDir(locale)}>
      <body>{children}</body>
    </html>
  );
}
