import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardLocaleProvider } from "../../lib/i18n/locale-provider";
import { DashboardThemeProvider } from "../../lib/theme/theme-provider";
import { HeaderThemeControl } from "./header-preferences";

describe("dashboard theme buttons accessible names", () => {
  it("preserves an accessible name when mobile CSS hides the visible labels", () => {
    const html = renderToStaticMarkup(
      <DashboardLocaleProvider>
        <DashboardThemeProvider>
          <HeaderThemeControl />
        </DashboardThemeProvider>
      </DashboardLocaleProvider>,
    );

    expect(html).toMatch(/<button[^>]*aria-label="Light"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/<button[^>]*aria-label="Dark"[^>]*aria-pressed="false"/);
  });
});
