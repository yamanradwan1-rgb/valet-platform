import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { employeeDictionary } from "../../lib/i18n/dictionary";
import { RetrievalAlertBanners } from "./employee-retrieval-alert";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

describe("Employee Retrieval foreground alert presentation", () => {
  it.each([
    { dir: "ltr" as const, locale: "en" as const },
    { dir: "rtl" as const, locale: "ar" as const },
  ])("renders accessible $locale copy in $dir", ({ dir, locale }) => {
    const t = employeeDictionary(locale);
    const markup = renderToStaticMarkup(
      <RetrievalAlertBanners
        body={t.retrievalAlertBody}
        dismissLabel={t.dismissAction}
        dir={dir}
        onDismiss={() => undefined}
        onOpenTask={() => undefined}
        taskIds={[TASK_ID]}
        title={t.retrievalAlertTitle}
      />,
    );
    expect(markup).toContain(`dir="${dir}"`);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain(t.retrievalAlertTitle);
    expect(markup).toContain(t.retrievalAlertBody);
    expect(markup).toContain(t.dismissAction);
    expect(markup).toContain(`aria-label="${t.dismissAction}"`);
    expect(markup).not.toContain(TASK_ID);
  });
});
