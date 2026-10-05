import { afterEach, expect, it, vi } from "vitest";
import { presenceId } from "./shift-presence-id";

afterEach(() => vi.unstubAllGlobals());
it("uses the existing browser UUID capability", () => {
  const randomUUID = vi.fn(() => "abcdefgh");
  vi.stubGlobal("crypto", { randomUUID });
  expect(presenceId()).toBe("abcdefgh");
  expect(randomUUID).toHaveBeenCalledOnce();
});
it("keeps manual submissions CSPRNG UUID-v4 on insecure-context browsers", () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(255));
  vi.stubGlobal("crypto", { getRandomValues });
  expect(presenceId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  expect(getRandomValues).toHaveBeenCalledOnce();
});
