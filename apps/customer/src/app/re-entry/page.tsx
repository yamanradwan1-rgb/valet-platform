"use client";

import React from "react";

import { VayletLogo } from "../../components/brand/vaylet-logo";
import { useTranslation } from "../../i18n/use-translation";

export default function ReEntryPage() {
  const { t } = useTranslation();
  return (
    <main className="reentry-page">
      <section className="reentry-card" aria-labelledby="reentry-title">
        <VayletLogo />
        <div aria-hidden="true" className="reentry-lock">
          ✓
        </div>
        <h1 id="reentry-title">{t("reentry.title")}</h1>
        <p>{t("reentry.body")}</p>
        <ol>
          <li>{t("reentry.secureLink")}</li>
          <li>{t("reentry.qr")}</li>
        </ol>
      </section>
    </main>
  );
}
