import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, vi } from "vitest";

import {
  GuestAuthProvider,
  useGuestAuth,
} from "../features/auth/guest-auth-context";
import { GuestContextConflictGate } from "../features/auth/guest-context-conflict-gate";
import {
  bootstrapGuestAuthTransport,
  switchGuestBrowserContextTransport,
} from "../features/auth/guest-auth-bootstrap";
import { GuestSessionProvider } from "../features/session/guest-session-provider";
import { useGuestSession } from "../features/session/use-guest-session";
import { GuestApiClient } from "../lib/api/guest-api-client";
import type { GuestSafeSession } from "../lib/api/guest-api-types";
import { GuestAppRoot } from "./guest-app-root";
import {
  findElement,
  installTestDom,
  invokeReactClick,
  type TestElement,
} from "./guest-refresh-mounted.test-host";

export const VISIT_A = "123e4567-e89b-12d3-a456-426614174000";
export const VISIT_B = "223e4567-e89b-12d3-a456-426614174000";
const TARGET_TOKEN = "B".repeat(43);
export const marker = (letter: string) =>
  `__Host-vaylet_guest_context=vgc1.${letter.repeat(32)}`;

export function snapshot(
  id = VISIT_A,
  state: GuestSafeSession["state"] = "PARKED",
): GuestSafeSession {
  return {
    valetSessionId: id,
    state,
    readyAt: null,
    vehicle: {
      make: "Toyota",
      model: id === VISIT_A ? "Visit A" : "Visit B",
      color: "White",
    },
  };
}

export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function flush() {
  for (let index = 0; index < 50; index += 1) await Promise.resolve();
}

export function retainClick(element: TestElement): () => void {
  const key = Object.keys(element).find((name) =>
    name.startsWith("__reactProps$"),
  )!;
  const props = (element as unknown as Record<string, { onClick: () => void }>)[
    key
  ]!;
  return props.onClick;
}

// Real providers, root, overlays, hooks, client and coordinator. Only HTTP and
// browser cookie storage are simulated; no test supplies session/auth props.
export function confirmationHarness(fragment = "") {
  const dom = installTestDom();
  const browserWindow = dom.window as unknown as Window;
  const document = dom.document as typeof dom.document & { cookie: string };
  document.cookie = marker("a");
  const location = { hash: fragment, pathname: "/", search: "" };
  dom.window.location = location;
  dom.window.history = {
    replaceState: () => {
      location.hash = "";
    },
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  let auth!: ReturnType<typeof useGuestAuth>;
  let session!: ReturnType<typeof useGuestSession>;
  let current = snapshot();
  let getOverride: (() => Promise<Response>) | null = null;
  let postOverride: (() => Promise<Response>) | null = null;
  let switchOverride: (() => Promise<Response>) | null = null;
  const posts: string[] = [];
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, init) => {
      const path = String(url);
      if (path.endsWith("/browser-session/prepare")) {
        return json({ result: "CONTEXT_CONFLICT", currentScope: "ACTIVE" });
      }
      if (path.endsWith("/browser-session/switch/reconcile"))
        return json({ result: "UNCHANGED" });
      if (path.endsWith("/browser-session/switch")) {
        if (switchOverride) return switchOverride();
        current = snapshot(VISIT_B);
        document.cookie = marker("b");
        return json({ result: "SWITCHED" });
      }
      if (path.endsWith("/session/request-retrieval")) {
        expect(init?.body).toBe("{}");
        expect(
          (init?.headers as Record<string, string>).Authorization,
        ).toBeUndefined();
        posts.push(current.valetSessionId);
        if (postOverride) return postOverride();
        current = snapshot(current.valetSessionId, "REQUESTED");
        return json(current);
      }
      if (path.endsWith("/session/cancel-retrieval")) {
        current = snapshot(current.valetSessionId);
        return json(current);
      }
      if (path.endsWith("/session"))
        return getOverride ? getOverride() : json(current);
      throw new Error(`Unexpected Guest request: ${path}`);
    });

  function Probe() {
    auth = useGuestAuth();
    session = useGuestSession();
    return null;
  }

  async function settle(operation: () => unknown) {
    await act(async () => {
      await operation();
      await flush();
    });
  }

  return {
    container,
    document,
    posts,
    fetchSpy,
    get auth(): ReturnType<typeof useGuestAuth> {
      return auth;
    },
    get session() {
      return session;
    },
    get client() {
      return auth.client;
    },
    setSnapshot(value: GuestSafeSession) {
      current = value;
    },
    setGet(value: (() => Promise<Response>) | null) {
      getOverride = value;
    },
    setPost(value: (() => Promise<Response>) | null) {
      postOverride = value;
    },
    setSwitch(value: (() => Promise<Response>) | null) {
      switchOverride = value;
    },
    settle,
    button(text: string): TestElement {
      return findElement(container, "button", text);
    },
    async click(text: string) {
      const button = findElement(container, "button", text);
      expect(button.getAttribute("disabled")).toBeNull();
      await settle(() => invokeReactClick(button));
    },
    async mount() {
      await settle(() =>
        root.render(
          <GuestAuthProvider>
            <GuestSessionProvider>
              <Probe />
              <GuestAppRoot />
              <GuestContextConflictGate />
            </GuestSessionProvider>
          </GuestAuthProvider>,
        ),
      );
      expect(container.textContent).toContain("Visit A");
      expect(session.isFresh).toBe(true);
    },
    // DEC-064 §11: another same-cookie tab explicitly chooses Open New.
    // Use the production prepare/switch transport, then let the still-mounted
    // source tab detect promotion through its normal authoritative refresh.
    async promoteFromOtherTab() {
      const prepared = await bootstrapGuestAuthTransport(TARGET_TOKEN, true);
      expect(prepared.contextConflictScope).toBe("ACTIVE");
      await switchGuestBrowserContextTransport(
        new GuestApiClient(TARGET_TOKEN),
      );
    },
    async wake() {
      await settle(() => browserWindow.dispatchEvent(new Event("focus")));
    },
    async unmount() {
      await settle(() => root.unmount());
    },
  };
}
