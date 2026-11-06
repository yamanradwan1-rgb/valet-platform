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
} from "./guest-web-push-client";
import { createGuestWebPushTransport } from "./guest-web-push-transport";
import {
  readGuestWebPushStatus,
  type GuestWebPushStatus,
  type GuestWebPushStatusTransport,
} from "./guest-web-push-status";
import {
  classifyGuestPushFailure,
  guestPushFeedbackCopy,
  type GuestPushFeedback,
} from "./guest-web-push-feedback";

import { GuestWebPushPermissionPresentation } from "./guest-web-push-permission-presentation";
export { GuestWebPushPermissionPresentation } from "./guest-web-push-permission-presentation";

type PresentationState = GuestWebPushStatus | "CHECKING" | "ENABLING" | "FAILED";
const CONFIG_CHECK_DEADLINE_MS = 12_000;
const ENABLE_DEADLINE_MS = 35_000;
const WAKE_CHECK_INTERVAL_MS = 2_000;

export function GuestWebPushPermissionCard({
  transport,
}: {
  readonly transport?: GuestWebPushStatusTransport;
}) {
  const { direction, locale } = useTranslation();
  const copy = guestWebPushCopy(locale);
  const [activeTransport] = useState(
    () => transport ?? createGuestWebPushTransport(),
  );
  const [dismissed, updateDismissed] = useState(false);
  const [feedback, setFeedback] = useState<GuestPushFeedback>();
  const [retryAt, setRetryAt] = useState(0);
  const retryAtRef = useRef(0);
  const mountedRef = useRef(false);
  const dismissedRef = useRef(false);
  const generationRef = useRef(0);
  const operationRef = useRef<AbortController | null>(null);
  const contextRef = useRef(readBrowserContextMarker());
  const [state, setState] = useState<PresentationState>("CHECKING");

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    operationRef.current?.abort();
    operationRef.current = null;
  }, []);

  const fail = useCallback(
    (error: unknown, fallback: GuestPushFeedback["kind"] = "FAILED") => {
      const result = classifyGuestPushFailure(error, fallback);
      const preserve = ["AUTH", "CONTEXT", "CONFLICT", "RATE_LIMITED"].includes(result.kind);
      setFeedback(fallback === "VERIFY" && !preserve ? { kind: "VERIFY" } : result);
      retryAtRef.current =
        result.retryAfter &&
          Number.isFinite(result.retryAfter) &&
          result.retryAfter > 0
          ? Date.now() + result.retryAfter * 1000
          : 0;
      setRetryAt(retryAtRef.current);
      const capability = detectGuestWebPushCapability(readGuestWebPushCapability());
      setState(capability === "AVAILABLE" ? "FAILED" : capability);
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

  const verify = useCallback(() => {
    if (!mountedRef.current || dismissedRef.current || operationRef.current ||
        Date.now() < retryAtRef.current) return;
    const marker = readBrowserContextMarker();
    if (marker !== contextRef.current) {
      contextChanged();
      return;
    }
    const controller = new AbortController();
    const generation = ++generationRef.current;
    operationRef.current = controller;
    const deadline = setTimeout(() => {
      if (!canCommit(controller, generation, marker)) return;
      invalidate();
      fail(undefined, "VERIFY");
    }, CONFIG_CHECK_DEADLINE_MS);
    void readGuestWebPushStatus(activeTransport, controller.signal).then(
        (status) => {
          if (!canCommit(controller, generation, marker)) return;
          setFeedback(status === "UNSUPPORTED" ? {
            kind: readGuestWebPushCapability().isSecureContext ? "UNSUPPORTED" : "INSECURE",
          } : undefined);
          setState(status);
        },
        (error: unknown) => {
          if (canCommit(controller, generation, marker)) fail(error, "VERIFY");
        },
      )
      .finally(() => {
        clearTimeout(deadline);
        if (operationRef.current === controller) operationRef.current = null;
      });
  }, [activeTransport, canCommit, contextChanged, fail, invalidate]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nextCheckAt = 0;
    let permission: PermissionStatus | undefined;
    const check = () => {
      timer = undefined;
      nextCheckAt = Date.now() + WAKE_CHECK_INTERVAL_MS;
      verify();
    };
    const wake = () => {
      if (document.visibilityState === "hidden" || dismissedRef.current ||
          timer !== undefined || operationRef.current) return;
      timer = setTimeout(check, Math.max(0, nextCheckAt - Date.now()));
    };
    queueMicrotask(() => { if (active) check(); });
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    navigator.serviceWorker?.addEventListener?.("controllerchange", wake);
    void navigator.permissions?.query({ name: "notifications" }).then((result) => {
      if (!active) return;
      permission = result;
      permission.addEventListener("change", wake);
    }).catch(() => undefined);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      navigator.serviceWorker?.removeEventListener?.("controllerchange", wake);
      permission?.removeEventListener("change", wake);
    };
  }, [verify]);

  if (dismissed || state === "CHECKING" || state === "DISABLED" || state === "ENABLED_VERIFIED") return null;
  const retryBlocked =
    retryAt !== 0 ||
    feedback?.kind === "AUTH" ||
    feedback?.kind === "CONFLICT" ||
    feedback?.kind === "CONTEXT";
  const onEnable = async () => {
    if (
      retryBlocked ||
      (state !== "AVAILABLE" && state !== "FAILED" &&
       state !== "SUBSCRIPTION_MISSING" && state !== "SERVER_BINDING_MISSING") ||
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
        setState("ENABLED_VERIFIED");
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
        feedback && state !== "DENIED" ? guestPushFeedbackCopy(locale, feedback.kind) : undefined
      }
      retryBlocked={retryBlocked}
      onDismiss={() => setDismissed(true)}
      onEnable={() => void onEnable()}
    />
  );
}
