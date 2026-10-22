"use client";

import { useEffect, useMemo, useState } from "react";
import type { GuestApiClient } from "../../lib/api/guest-api-client";
import { guestPresentationContext } from "../../lib/guest-presentation-context";
import { readBrowserContextMarker } from "../../lib/api/guest-browser-context-marker";
import type { GuestSafeSession } from "../../lib/api/guest-api-types";
import {
  bindRatingPresentation,
  RatingPresentationPolicy,
} from "../rating/rating-presentation-policy";
import type { GuestPostVisitSurface } from "./guest-post-visit-screen";

interface Selection {
  readonly client: GuestApiClient;
  readonly visitId: string;
  readonly surface: GuestPostVisitSurface;
}

export function useGuestPostVisit({
  client,
  session,
  canEnter,
  canRemain,
  hasBrowserSession = true,
}: {
  readonly client: GuestApiClient | null;
  readonly session: GuestSafeSession | null;
  readonly canEnter: boolean;
  readonly canRemain: boolean;
  readonly hasBrowserSession?: boolean;
}) {
  const visitId = session?.valetSessionId ?? null;
  const scope = useMemo(() => ({ client, visitId }), [client, visitId]);
  const [selection, setSelection] = useState<
    (Selection & { scope: typeof scope }) | null
  >(null);
  const [binding, setBinding] = useState<{
    scope: typeof scope;
    policy: RatingPresentationPolicy;
  } | null>(null);
  const policy = binding?.scope === scope ? binding.policy : null;
  const visible = canRemain && selection?.scope === scope ? selection : null;

  useEffect(() => {
    if (!client || !visitId) return;
    let marker: string | null = null;
    try {
      marker = readBrowserContextMarker();
    } catch {
      /* Restricted cookie access. */
    }
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      /* Private/restricted context. */
    }
    const nonce = hasBrowserSession ? guestPresentationContext() : null;
    const context = hasBrowserSession
      ? nonce && marker
        ? `${nonce}:${marker}`
        : (nonce ?? marker)
      : null;
    const key = context
      ? `vaylet:rating-presentation:v1:${context}:${visitId}`
      : null;
    const next = new RatingPresentationPolicy(storage, key);
    const unbind = bindRatingPresentation(client, visitId, next);
    let active = true;
    queueMicrotask(() => {
      if (active) setBinding({ scope, policy: next });
    });
    return () => {
      active = false;
      next.invalidate();
      unbind();
    };
  }, [client, visitId, scope, hasBrowserSession]);

  useEffect(() => {
    if (!client || !visitId || !canEnter || visible || !policy) return;
    let active = true;
    // Strict Mode's abandoned effect cannot consume an automatic attempt.
    queueMicrotask(() => {
      if (active && policy.begin())
        setSelection({ client, visitId, surface: "rating", scope });
    });
    return () => {
      active = false;
    };
  }, [client, visitId, canEnter, visible, policy, scope]);

  return {
    selection: visible,
    open(surface: GuestPostVisitSurface) {
      if (!client || !visitId || !canRemain || !policy) return;
      // An explicit contextual action wins over any queued automatic entry.
      policy.dismiss();
      setSelection({ client, visitId, surface, scope });
    },
    back() {
      policy?.dismiss();
      setSelection(null);
    },
    authorized() {
      policy?.opened();
    },
  };
}
