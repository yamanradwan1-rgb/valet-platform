"use client";

import { BookOpen, CircleHelp, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { useAccountSecurityAccess } from "../security/account-security-access-provider";
import { AccountContextHelp } from "../../features/help/account-context-help";
import helpSlot from "../../features/help/help-slot.module.css";
import { helpCopy } from "./help-copy";
import styles from "./help-foundation.module.css";

export function HelpFoundation() {
  const { locale, t } = useDashboardLocale();
  const securityAccess = useAccountSecurityAccess();
  const copy = helpCopy(locale);
  return (
    <div className={styles.page}>
      <header className={helpSlot.anchor}>
        <h1><CircleHelp aria-hidden="true" />{t("helpTitle")}</h1>
        <span className={helpSlot.corner}><AccountContextHelp helpKey="help.page" /></span>
        <p>{copy.subtitle}</p>
      </header>
      <section className={`${styles.card} ${styles.notice}`}>
        <BookOpen aria-hidden="true" />
        <div>
          <h2>{copy.notice}</h2>
          <p>{copy.noticeBody}</p>
        </div>
      </section>
      <div className={styles.columns}>
        <section className={`${styles.card} ${helpSlot.anchor}`} aria-labelledby="help-workspace">
          <h2 id="help-workspace">{copy.guideTitle}</h2>
          <span className={helpSlot.insetCorner}><AccountContextHelp helpKey="help.guides" /></span>
          {copy.guides.map(([title, body]) => (
            <article className={styles.guide} key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </section>
        <div className={styles.stack}>
          {securityAccess.snapshot.status === "eligible" ? (
            <section className={`${styles.card} ${helpSlot.anchor}`} aria-labelledby="help-security">
              <h2 id="help-security"><ShieldCheck aria-hidden="true" />{copy.securityTitle}</h2>
              <span className={helpSlot.insetCorner}><AccountContextHelp helpKey="help.security" /></span>
              <p>{copy.securityBody}</p>
              <Link className={styles.link} href="/security">
                {copy.securityLink}
              </Link>
            </section>
          ) : null}
          <section className={`${styles.card} ${helpSlot.anchor}`} aria-labelledby="help-faq">
            <h2 id="help-faq">{copy.faqTitle}</h2>
            <span className={helpSlot.insetCorner}><AccountContextHelp helpKey="help.faq" /></span>
            {copy.faqs.map(([question, answer]) => (
              <details className={styles.faq} key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
