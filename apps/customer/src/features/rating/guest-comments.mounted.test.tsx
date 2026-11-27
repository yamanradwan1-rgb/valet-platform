import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestDom, invokeReactClick, type TestElement, type TestNode } from
  "../../app/guest-refresh-mounted.test-host";
import { LocaleProvider } from "../../i18n/locale-provider";
import type { GuestApiClient } from "../../lib/api/guest-api-client";
import { GuestLiveRating } from "./guest-live-rating";

const visit = "123e4567-e89b-12d3-a456-426614174000";
const nextVisit = "123e4567-e89b-12d3-a456-426614174001";

function findTags(node: TestNode, name: string): TestElement[] {
  const found: TestElement[] = [];
  const pending = [...node.childNodes];
  while (pending.length) {
    const current = pending.shift()!;
    if (current.nodeName === name.toUpperCase()) found.push(current as TestElement);
    pending.unshift(...current.childNodes);
  }
  return found;
}

function change(element: TestElement, value: string) {
  const key = Object.keys(element).find((name) => name.startsWith("__reactProps$"));
  const handler = key ? (element as unknown as Record<string,
    { onChange?: (event: { target: { value: string } }) => void }>)[key]?.onChange : undefined;
  if (!handler) throw new Error("Missing textarea onChange handler");
  handler({ target: { value } });
}

describe("#463 frozen Guest rating mounted surface", () => {
  let root: Root;
  let container: TestElement;

  beforeEach(() => {
    const dom = installTestDom();
    container = dom.document.createElement("div");
    dom.document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); });
    vi.restoreAllMocks();
  });

  async function show(client: GuestApiClient, visitId = visit, locale: "en" | "ar" = "en") {
    await act(async () => {
      root.render(<LocaleProvider initialLocale={locale}>
        <GuestLiveRating client={client} visitId={visitId} canRate onBack={() => {}} />
      </LocaleProvider>);
    });
  }

  it.each([
    ["en", "Comments about the service (optional)", "Share your feedback about your experience..."],
    ["ar", "ملاحظاتك عن الخدمة (اختياري)", "شاركنا ملاحظاتك عن تجربتك..."],
  ] as const)("preserves frozen %s textarea and star-required submit", async (locale, label, placeholder) => {
    const client = { submitFeedback: vi.fn() } as unknown as GuestApiClient;
    await show(client, visit, locale);
    const textarea = findTags(container, "textarea")[0]!;
    expect(container.textContent).toContain(label);
    expect(textarea.getAttribute("placeholder")).toBe(placeholder);
    expect(textarea.getAttribute("rows")).toBe("3");
    expect(findTags(container, "label")[0]?.getAttribute("for")).toBe("rating-comment");
    const submit = findTags(container, "button").find((b) => b.textContent.includes(
      locale === "en" ? "Submit rating" : "إرسال التقييم"))!;
    expect(submit.getAttribute("disabled")).not.toBeNull();
    await act(async () => { change(textarea, "Only a comment"); });
    expect(submit.getAttribute("disabled")).not.toBeNull();
    await act(async () => { invokeReactClick(findTags(container, "button")[4]!); });
    expect(submit.getAttribute("disabled")).toBeNull();
  });

  it("sends one immutable snapshot, locks in flight and immediately blanks a reused visit scope", async () => {
    let settle!: (value: { valetSessionId: string; rating: number }) => void;
    const promise = new Promise<{ valetSessionId: string; rating: number }>((resolve) => { settle = resolve; });
    const submitFeedback = vi.fn(() => promise);
    const client = { submitFeedback } as unknown as GuestApiClient;
    await show(client);
    const textarea = findTags(container, "textarea")[0]!;
    await act(async () => {
      change(textarea, "  Great\r\nthanks  ");
      invokeReactClick(findTags(container, "button")[3]!);
    });
    const submit = findTags(container, "button").find((b) => b.textContent === "Submit rating")!;
    await act(async () => { invokeReactClick(submit); });
    expect(submitFeedback).toHaveBeenCalledTimes(1);
    expect(submitFeedback).toHaveBeenCalledWith({
      rating: 4, expectedValetSessionId: visit, comment: "Great\nthanks",
    });
    expect(findTags(container, "textarea")[0]?.getAttribute("disabled")).not.toBeNull();
    await show(client, nextVisit);
    const nextField = findTags(container, "textarea")[0]!;
    expect(nextField.value).toBe("");
    expect(findTags(container, "button").filter((b) => b.getAttribute("aria-pressed") === "true"))
      .toHaveLength(0);
    await act(async () => { settle({ valetSessionId: visit, rating: 4 }); await promise; });
    expect(container.textContent).not.toContain("Thanks for your feedback.");
    expect(container.textContent).not.toContain("Great");
    await show(client, visit);
    expect(findTags(container, "textarea")[0]?.value).toBe("");
    expect(findTags(container, "button").filter((b) => b.getAttribute("aria-pressed") === "true"))
      .toHaveLength(0);
  });
});
