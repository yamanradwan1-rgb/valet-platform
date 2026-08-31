import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { LocaleProvider } from "../i18n/locale-provider";
import { ThemeProvider } from "../theme/theme-provider";
import { documentBootstrapScript } from "./document-bootstrap-script";
import "./customer-web-push.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "VAYLET Guest",
  description:
    "Digital operating system for valet operations - Guest Experience",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" dir="ltr" data-theme="light" suppressHydrationWarning>
      <head>
        <meta id="vaylet-theme-color" name="theme-color" content="#FAFAF8" />
        <Script id="vaylet-document-bootstrap" strategy="beforeInteractive">
          {documentBootstrapScript}
        </Script>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body>
        <LocaleProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
