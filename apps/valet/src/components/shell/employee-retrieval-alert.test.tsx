import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
        dir={dir}
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
    expect(markup).not.toContain(TASK_ID);
  });

  it("click handling delegates only the Task ID to navigation", () => {
    const onOpenTask = vi.fn();
    const element = RetrievalAlertBanners({
      body: "Body",
      dir: "ltr",
      onOpenTask,
      taskIds: [TASK_ID],
      title: "Title",
    });
    const buttons = element.props.children as React.ReactElement<{
      onClick: () => void;
    }>[];
    buttons[0]!.props.onClick();
    expect(onOpenTask).toHaveBeenCalledOnce();
    expect(onOpenTask).toHaveBeenCalledWith(TASK_ID);
  });
});
