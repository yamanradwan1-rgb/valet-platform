import type {
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
} from "@valet/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { employeeDictionary } from "../../../lib/i18n/dictionary";
import { EmployeeI18nProvider } from "../../shell/employee-i18n";
import { CheckInRecoverableStep } from "./check-in-recoverable-step";

const draft: StaffCheckInDraftSummary = {
  conditionCompletedAt: null,
  createdAt: "2026-10-30T07:00:00.000Z",
  sessionId: "11111111-1111-4111-8111-111111111111",
  vehicle: {
    color: "White",
    make: "Toyota",
    model: "Camry",
    plateCountry: "JO",
    plateNumberRaw: "11-11111",
    temporaryDescriptor: null,
  },
};

const continuation: StaffCheckInContinuationSummary = {
  createdAt: "2026-10-30T07:05:00.000Z",
  sessionId: "22222222-2222-4222-8222-222222222222",
  vehicle: {
    color: "Black",
    make: "BMW",
    model: "X5",
    plateCountry: "JO",
    plateNumberRaw: "22-22222",
    temporaryDescriptor: null,
  },
};

function renderChoices(locale: "en" | "ar"): string {
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={locale}>
      <div dir={locale === "ar" ? "rtl" : "ltr"}>
        <CheckInRecoverableStep
          drafts={[draft]}
          continuations={[continuation]}
          onResumeDraft={vi.fn()}
          onResumeContinuation={vi.fn()}
          onBack={vi.fn()}
        />
      </div>
    </EmployeeI18nProvider>,
  );
}

function recoveryButtons(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes("hover:border-vblue"));
}

describe("recoverable Check-In choices", () => {
  it.each(["en", "ar"] as const)(
    "exposes draft and continuation as native keyboard-operable choices in %s",
    (locale) => {
      const markup = renderChoices(locale);
      const [draftButton, continuationButton] = recoveryButtons(markup);

      expect(markup).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
      expect(recoveryButtons(markup)).toHaveLength(2);
      for (const button of [draftButton, continuationButton]) {
        expect(button).toBeDefined();
        expect(button).toMatch(/^<button\b/);
        expect(button).toContain('type="button"');
        expect(button).toContain("block w-full text-start");
        expect(button).toContain(
          "bg-white rounded-2xl border border-vborder p-4 cursor-pointer hover:border-vblue transition-colors shadow-sm",
        );
        expect(button).not.toContain("<p");
      }

      expect(draftButton).toContain(employeeDictionary(locale).draft);
      expect(draftButton).toContain("Toyota Camry");
      expect(draftButton).toContain("11-11111");
      expect(continuationButton).toContain(
        employeeDictionary(locale).awaitingParking,
      );
      expect(continuationButton).toContain("BMW X5");
      expect(continuationButton).toContain("22-22222");
    },
  );

  it("preserves a distinct actionable choice when only one kind is present", () => {
    const draftOnly = renderToStaticMarkup(
      <CheckInRecoverableStep
        drafts={[draft]}
        continuations={[]}
        onResumeDraft={vi.fn()}
        onResumeContinuation={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const continuationOnly = renderToStaticMarkup(
      <CheckInRecoverableStep
        drafts={[]}
        continuations={[continuation]}
        onResumeDraft={vi.fn()}
        onResumeContinuation={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(recoveryButtons(draftOnly)).toHaveLength(1);
    expect(recoveryButtons(continuationOnly)).toHaveLength(1);
    expect(draftOnly).toContain("Toyota Camry");
    expect(continuationOnly).toContain("BMW X5");
  });
});

it.runIf(process.env.CHECK_IN_RECOVERABLE_BROWSER === "1")(
  "activates each native choice once per keyboard or pointer action in EN and AR",
  async () => {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({ timeout: 10_000 });
    try {
      for (const locale of ["en", "ar"] as const) {
        const page = await browser.newPage();
        page.setDefaultTimeout(5_000);
        try {
          await page.setContent(renderChoices(locale));
          const choices = page.locator('button[class*="hover:border-vblue"]');
          expect(await choices.count()).toBe(2);
          expect(
            await page.getByRole("button", { name: /Toyota Camry/ }).count(),
          ).toBe(1);
          expect(
            await page.getByRole("button", { name: /BMW X5/ }).count(),
          ).toBe(1);

          await choices.evaluateAll((nodes) => {
            nodes.forEach((node, index) => {
              node.addEventListener("click", () => {
                const key = index === 0 ? "draftClicks" : "continuationClicks";
                document.body.dataset[key] = String(
                  Number(document.body.dataset[key] ?? "0") + 1,
                );
              });
            });
          });

          await page.keyboard.press("Tab"); // Existing BackHeader
          await page.keyboard.press("Tab"); // Draft
          expect(
            await choices
              .nth(0)
              .evaluate((node) => node === document.activeElement),
          ).toBe(true);
          await page.keyboard.press("Enter");
          expect(
            await page.locator("body").getAttribute("data-draft-clicks"),
          ).toBe("1");

          await page.keyboard.press("Tab"); // Continuation
          expect(
            await choices
              .nth(1)
              .evaluate((node) => node === document.activeElement),
          ).toBe(true);
          await page.keyboard.press("Space");
          expect(
            await page.locator("body").getAttribute("data-continuation-clicks"),
          ).toBe("1");

          await choices.nth(0).click();
          await choices.nth(1).click();
          expect(
            await page.locator("body").getAttribute("data-draft-clicks"),
          ).toBe("2");
          expect(
            await page.locator("body").getAttribute("data-continuation-clicks"),
          ).toBe("2");
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  },
  30_000,
);
