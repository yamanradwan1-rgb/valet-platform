import { describe, expect, it } from "vitest";
import { reconcilePersistedDraft } from "./use-revisioned-draft";

describe("canonical server revision synchronization", () => {
  it("retains unsaved edits when locale changes without a persisted revision", () => {
    const state = { revision: 4, value: {
      en: { text: "Unsubmitted", url: "https://example.com" },
      ar: { text: "محتوى", url: "" },
    } };
    const rerender = { revision: 4, value: {
      en: { text: "Old data", url: "" },
      ar: { text: "", url: "" },
    } };
    expect(reconcilePersistedDraft(state, rerender)).toBe(state);
  });

  it("adopts normalized API values when a save advances the revision", () => {
    const draft = { revision: 4, value: { url: "https://example.com" } };
    const saved = { revision: 5, value: { url: "https://example.com/" } };
    expect(reconcilePersistedDraft(draft, saved)).toBe(saved);
    const phoneDraft = { revision: 8, value: { phone: "+962 (79) 911-1111" } };
    const phoneSaved = { revision: 9, value: { phone: "+962799111111" } };
    expect(reconcilePersistedDraft(phoneDraft, phoneSaved)).toBe(phoneSaved);
  });
});
