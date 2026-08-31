import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../../i18n/locale-provider";
import ReEntryPage from "./page";

describe("credential-free Customer re-entry", () => {
  it.each([
    ["en", "Reopen your secure VAYLET access", "scan the QR again"],
    ["ar", "أعد فتح وصول VAYLET الآمن", "امسح رمز QR مجدداً"],
  ] as const)(
    "renders %s secure-link and QR guidance without session disclosure",
    (locale, title, qr) => {
      const markup = renderToStaticMarkup(
        <LocaleProvider initialLocale={locale}>
          <ReEntryPage />
        </LocaleProvider>,
      );
      expect(markup).toContain(title);
      expect(markup).toContain(qr);
      expect(markup).not.toMatch(
        /guestToken|valetSessionId|readyAt|Authorization/i,
      );
      expect(markup).not.toContain("recover session");
    },
  );
});
