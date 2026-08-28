/** Sign-in continuation is exercised through the page's submit handler. */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let next: string | null = null;
const signIn = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({ get: () => next }),
}));
vi.mock("../../../features/auth/use-auth", () => ({
  useAuth: () => ({ signIn, status: "unauthenticated" }),
}));
vi.mock("../../../i18n/locale-provider", () => ({
  useTranslation: () => ({ isRtl: false, t: (key: string) => key }),
}));

import SignInPage from "./page";
import { installMinimalBrowser } from "../../../features/map-setup/setup-map.integration.test-double";

let restoreBrowser: () => void = () => undefined;

function reactProps(element: object): Record<string, unknown> {
  const props = Object.values(element).find(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      ("onChange" in value || "onSubmit" in value),
  );
  if (props === undefined) throw new Error("React props were not attached");
  return props as Record<string, unknown>;
}

function findAll(element: { childNodes: unknown[]; tagName: string }, tagName: string) {
  const found = element.tagName === tagName ? [element] : [];
  for (const child of element.childNodes) {
    if (typeof child === "object" && child !== null && "childNodes" in child) {
      found.push(...findAll(child as { childNodes: unknown[]; tagName: string }, tagName));
    }
  }
  return found;
}

async function submit(): Promise<void> {
  const inputs = (document.body as unknown as { childNodes: unknown[] }).childNodes;
  const root = inputs[0] as { childNodes: unknown[]; tagName: string };
  const [email, password] = findAll(root, "INPUT");
  const [form] = findAll(root, "FORM");
  if (email === undefined || password === undefined || form === undefined) {
    throw new Error("Sign-in controls were not rendered");
  }
  await act(async () => {
    (reactProps(email).onChange as (event: unknown) => void)({ target: { value: "staff@example.test" } });
    (reactProps(password).onChange as (event: unknown) => void)({ target: { value: "secret" } });
  });
  await act(async () => {
    (reactProps(form).onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => undefined });
    await Promise.resolve();
  });
}

describe("SignInPage continuation integration", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    restoreBrowser = installMinimalBrowser();
    next = null;
    replace.mockReset();
    signIn.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    restoreBrowser();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it.each([
    ["/tasks", "/tasks"],
    ["/sessions?state=active", "/sessions?state=active"],
    ["https://attacker.test", "/overview"],
    [null, "/overview"],
    ["/sign-in", "/overview"],
  ])("replaces %s with the safe destination %s after successful sign-in", async (requested, expected) => {
    next = requested;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => root.render(<SignInPage />));
    await submit();
    expect(signIn).toHaveBeenCalledWith("staff@example.test", "secret");
    expect(replace).toHaveBeenCalledWith(expected);
    act(() => root.unmount());
    document.body.removeChild(container);
  });
});
