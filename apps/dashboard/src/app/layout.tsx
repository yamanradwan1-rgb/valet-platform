import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { AppProviders } from "./app-providers";
import { dashboardDocumentBootstrapScript } from "./document-bootstrap-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "VAYLET Management",
  description: "VAYLET Management Dashboard",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" dir="ltr" data-theme="light" suppressHydrationWarning>
      <head>
        <Script id="vaylet-dashboard-bootstrap" strategy="beforeInteractive">
          {dashboardDocumentBootstrapScript}
        </Script>
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
