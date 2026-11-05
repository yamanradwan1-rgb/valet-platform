import { describe, expect, it } from "vitest";
import { isOrdinaryAlertSourceClick } from "./alert-legacy-source-click";

const plain = {
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
};

describe("Phase1 frozen alert source link interactions", () => {
  it("closes panel only on an ordinary primary click", () => {
    expect(isOrdinaryAlertSourceClick(plain)).toBe(true);
    for (const modifier of [
      "ctrlKey",
      "metaKey",
      "shiftKey",
      "altKey",
    ] as const) {
      expect(isOrdinaryAlertSourceClick({ ...plain, [modifier]: true })).toBe(
        false,
      );
    }
    expect(isOrdinaryAlertSourceClick({ ...plain, button: 1 })).toBe(false);
    expect(isOrdinaryAlertSourceClick({ ...plain, button: 2 })).toBe(false);
  });
});
