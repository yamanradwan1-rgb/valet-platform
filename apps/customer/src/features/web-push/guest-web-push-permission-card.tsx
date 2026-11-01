"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { useTranslation } from "../../i18n/use-translation";
import {
  GUEST_CONTEXT_CHANGED_EVENT,
  readBrowserContextMarker,
} from "../../lib/api/guest-browser-context-marker";
import { guestWebPushCopy } from "./guest-web-push-copy";
import {
  detectGuestWebPushCapability,
  enableGuestWebPush,
  readGuestWebPushCapability,
  type GuestWebPushCapability,
  type GuestWebPushTransport,
} from "./guest-web-push-client";
import { createGuestWebPushTransport } from "./guest-web-push-transport";
import {
  classifyGuestPushFailure,
  guestPushFeedbackCopy,
  type GuestPushFeedback,
} from "./guest-web-push-feedback";

import { GuestWebPushPermissionPresentation } from "./guest-web-push-permission-presentation";
export { GuestWebPushPermissionPresentation } from "./guest-web-push-permission-presentation";

type PresentationState =
  GuestWebPushCapability | "CHECKING" | "ENABLING" | "FAILED";
const CONFIG_CHECK_DEADLINE_MS = 12_000;
const ENABLE_DEADLINE_MS = 35_000;

export function GuestWebPushPermissionCard({
  transport,
}: {
  readonly transport?: GuestWebPushTransport;
}) {
  const { direction, locale } = useTranslation();
  const copy = guestWebPushCopy(locale);
  const [activeTransport] = useState(
    () => transport ?? createGuestWebPushTransport(),
  );
  const [dismissed, updateDismissed] = useState(false);
  const [feedback, setFeedback] = useState<GuestPushFeedback | undefined>(
    () => {
      if (typeof window === "undefined") return undefined;
      const snapshot = readGuestWebPushCapability();
      const capability = detectGuestWebPushCapability(snapshot);
      if (capability === "DENIED") return { kind: "DENIED" };
      if (capability === "UNSUPPORTED")
        return {
          kind: snapshot.isSecureContext === false ? "INSECURE" : "UNSUPPORTED",
        };
      return undefined;
    },
  );
  const [retryAt, setRetryAt] = useState(0);
  const mountedRef = useRef(false);
  const dismissedRef = useRef(false);
  const generationRef = useRef(0);
  const operationRef = useRef<AbortController | null>(null);
  const contextRef = useRef(readBrowserContextMarker());
  const [state, setState] = useState<PresentationState>(() => {
    if (typeof window === "undefined") return "UNSUPPORTED";
    const capability = detectGuestWebPushCapability(
      readGuestWebPushCapability(),
    );
    return capability === "AVAILABLE" ? "CHECKING" : capability;
  });

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    operationRef.current?.abort();
    operationRef.current = null;
  }, []);

  const fail = useCallback(
    (error: unknown, fallback: GuestPushFeedback["kind"] = "FAILED") => {
      const result = classifyGuestPushFailure(error, fallback);
      setFeedback(result);
      setRetryAt(
        result.retryAfter &&
          Number.isFinite(result.retryAfter) &&
          result.retryAfter > 0
          ? Date.now() + result.retryAfter * 1000
          : 0,
      );
      setState("FAILED");
    },
    [],
  );

  const contextChanged = useCallback(() => {
    invalidate();
    setFeedback({ kind: "CONTEXT" });
    setState("FAILED");
  }, [invalidate]);

  useEffect(() => {
    if (!retryAt) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = retryAt - Date.now();
      if (remaining <= 0) setRetryAt(0);
      else timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    };
    check();
    return () => clearTimeout(timer);
  }, [retryAt]);

  // The existing Not now JSX calls this synchronously, including while enabling.
  const setDismissed = useCallback(
    (value: boolean) => {
      if (value) {
        dismissedRef.current = true;
        invalidate();
      }
      updateDismissed(value);
    },
    [invalidate],
  );

  const canCommit = useCallback(
    (
      controller: AbortController,
      generation: number,
      marker: string | null,
    ) => {
      if (
        !mountedRef.current ||
        dismissedRef.current ||
        controller.signal.aborted ||
        operationRef.current !== controller ||
        generationRef.current !== generation
      )
        return false;
      if (readBrowserContextMarker() !== marker) {
        contextChanged();
        return false;
      }
      return true;
    },
    [contextChanged],
  );

  useEffect(() => {
    mountedRef.current = true;
    const onContextChange = contextChanged;
    window.addEventListener(GUEST_CONTEXT_CHANGED_EVENT, onContextChange);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(GUEST_CONTEXT_CHANGED_EVENT, onContextChange);
      invalidate();
    };
  }, [invalidate, contextChanged]);

  useEffect(() => {
    if (state !== "CHECKING" || dismissedRef.current) return;
    const controller = new AbortController();
    const generation = ++generationRef.current;
    const marker = readBrowserContextMarker();
    operationRef.current = controller;
    const deadline = setTimeout(() => {
      if (!canCommit(controller, generation, marker)) return;
      invalidate();
      fail(undefined, "TIMEOUT");
    }, CONFIG_CHECK_DEADLINE_MS);
    void activeTransport
      .loadVapidPublicKey(controller.signal)
      .then(
        () => {
          if (canCommit(controller, generation, marker)) setState("AVAILABLE");
        },
        (error: unknown) => {
          if (canCommit(controller, generation, marker)) fail(error, "CONFIG");
        },
      )
      .finally(() => clearTimeout(deadline));
    return () => {
      clearTimeout(deadline);
      controller.abort();
      if (operationRef.current === controller) operationRef.current = null;
    };
  }, [activeTransport, canCommit, fail, invalidate, state]);

  if (dismissed || state === "CHECKING") return null;
  const retryBlocked =
    retryAt !== 0 ||
    feedback?.kind === "AUTH" ||
    feedback?.kind === "CONFLICT" ||
    feedback?.kind === "CONTEXT";
  const onEnable = async () => {
    if (
      retryBlocked ||
      (state !== "AVAILABLE" && state !== "FAILED") ||
      !mountedRef.current ||
      dismissedRef.current ||
      operationRef.current !== null
    )
      return;
    if (contextRef.current !== readBrowserContextMarker()) {
      contextChanged();
      return;
    }
    const controller = new AbortController();
    const generation = ++generationRef.current;
    const marker = readBrowserContextMarker();
    operationRef.current = controller;
    setState("ENABLING");
    const deadline = setTimeout(() => {
      if (!canCommit(controller, generation, marker)) return;
      invalidate();
      // The defensive outer deadline cannot prove where a custom/native
      // operation stopped. Never imply rollback after a possible POST.
      fail(undefined, "UNKNOWN");
    }, ENABLE_DEADLINE_MS);
    try {
      const result = await enableGuestWebPush(
        activeTransport,
        locale,
        controller.signal,
      );
      if (!canCommit(controller, generation, marker)) return;
      if (result === "ENABLED") {
        setDismissed(true);
        return;
      }
      if (result === "AVAILABLE") setFeedback({ kind: "DISMISSED" });
      else if (result === "DENIED") setFeedback({ kind: "DENIED" });
      else if (result === "UNSUPPORTED")
        setFeedback({
          kind:
            readGuestWebPushCapability().isSecureContext === false
              ? "INSECURE"
              : "UNSUPPORTED",
        });
      setState(result);
    } catch (error) {
      if (canCommit(controller, generation, marker)) fail(error);
    } finally {
      clearTimeout(deadline);
      if (operationRef.current === controller) operationRef.current = null;
    }
  };

  return (
    <GuestWebPushPermissionPresentation
      copy={copy}
      direction={direction}
      state={state}
      feedback={
        feedback ? guestPushFeedbackCopy(locale, feedback.kind) : undefined
      }
      retryBlocked={retryBlocked}
      onDismiss={() => setDismissed(true)}
      onEnable={() => void onEnable()}
    />
  );
}
