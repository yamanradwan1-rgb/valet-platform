import { describe, expect, it } from "vitest";
import { keyStatusLabel, keyUsageLabel } from "./key-presentation";

describe("key presentation", () => {
  it.each(["en", "ar"] as const)(
    "keeps slot status separate from usage in %s",
    (locale) => {
      expect(keyStatusLabel("ACTIVE", locale)).not.toBe(
        keyStatusLabel("INACTIVE", locale),
      );
      expect(keyUsageLabel(null, locale)).not.toBe(
        keyUsageLabel("session-id", locale),
      );
      expect(keyUsageLabel("session-id", locale)).not.toContain("session-id");
    },
  );
  it("uses operational labels without inferring a holder or vehicle", () => {
    expect(keyStatusLabel("ACTIVE", "en")).toBe("Active");
    expect(keyStatusLabel("INACTIVE", "ar")).toBe("غير نشط");
    expect(keyUsageLabel(null, "en")).toBe("Empty");
    expect(keyUsageLabel("id", "en")).toBe("In use");
    expect(keyUsageLabel("id", "ar")).toBe("قيد الاستخدام");
  });
});
