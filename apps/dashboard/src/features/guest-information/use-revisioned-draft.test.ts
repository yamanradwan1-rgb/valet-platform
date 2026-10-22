import { describe, expect, it } from "vitest";
import { reconcilePersistedDraft } from "./use-revisioned-draft";

describe("canonical server revision synchronization", () => {
  it("retains unsaved edits when locale changes without a persisted revision", () => {
    const state = { revision: 4, value: {
      en: { text: "Unsubmitted", url: "https://example.com" },
      ar: { text: "محتوى", url: "" },
    }, savedValue: {
      en: { text: "", url: "" }, ar: { text: "", url: "" },
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
    expect(reconcilePersistedDraft({ ...draft, savedValue: draft.value }, saved))
      .toEqual({ ...saved, savedValue: saved.value });
    const phoneDraft = { revision: 8, value: { phone: "+962 (79) 911-1111" } };
    const phoneSaved = { revision: 9, value: { phone: "+962799111111" } };
    expect(reconcilePersistedDraft({ ...phoneDraft, savedValue: phoneDraft.value }, phoneSaved))
      .toEqual({ ...phoneSaved, savedValue: phoneSaved.value });
  });

  it("keeps conflicting unsaved edits only after the user explicitly chooses them", () => {
    const local = {
      revision: 10,
      value: { text: "My unsaved change", url: "https://mine.example/" },
      savedValue: { text: "Original", url: "" },
    };
    const latest = {
      revision: 11,
      value: { text: "Edited elsewhere", url: "https://company.example/" },
    };
    expect(reconcilePersistedDraft(local, latest, true)).toEqual({
      revision: 11, value: local.value, savedValue: latest.value,
    });
    expect(reconcilePersistedDraft(local, latest, false)).toEqual({
      revision: 11, value: latest.value, savedValue: latest.value,
    });
  });
});
