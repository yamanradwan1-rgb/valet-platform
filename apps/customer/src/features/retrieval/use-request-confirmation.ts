"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { GuestApiClient } from "../../lib/api/guest-api-client";
import { readBrowserContextMarker } from "../../lib/api/guest-browser-context-marker";
import type { GuestSafeSession } from "../../lib/api/guest-api-types";

interface ConfirmationIntent {
  readonly client: GuestApiClient;
  readonly valetSessionId: string;
  readonly browserMarker: string | null;
}

interface ConfirmationContext {
  readonly client: GuestApiClient | null;
  readonly session: GuestSafeSession | null;
  readonly hasBrowserSession: boolean;
  readonly hasAuthority: boolean;
  readonly isFresh: boolean;
  readonly isMutating: boolean;
  readonly requestVehicle: () => Promise<boolean>;
}

// Presentation intent only. This never supplies session authority to the API.
export function useRequestConfirmation(context: ConfirmationContext) {
  const [pending, setPending] = useState<ConfirmationIntent | null>(null);
  const browserMarker = context.hasBrowserSession
    ? readBrowserContextMarker()
    : null;
  const eligible =
    context.hasAuthority &&
    context.client !== null &&
    context.session?.state === "PARKED";
  const matches = Boolean(
    pending &&
    eligible &&
    pending.client === context.client &&
    pending.valetSessionId === context.session?.valetSessionId &&
    pending.browserMarker === browserMarker,
  );

  // Clear ownership during rendering, including loading/unavailable routes.
  // Hiding alone would allow A -> unavailable -> A to revive an old intent.
  if (pending && !matches) setPending(null);

  const live = {
    context,
    pending: matches ? pending : null,
    browserMarker,
    eligible,
  };
  const latest = useRef(live);
  useLayoutEffect(() => {
    latest.current = live;
    return () => {
      latest.current = { ...live, pending: null, eligible: false };
    };
  });

  const close = () => {
    setPending((current) => (current === pending ? null : current));
  };

  const open = () => {
    const current = latest.current;
    if (
      current !== live ||
      !current.eligible ||
      !context.isFresh ||
      context.isMutating ||
      !context.client ||
      !context.session ||
      (context.hasBrowserSession &&
        readBrowserContextMarker() !== browserMarker)
    )
      return;
    setPending({
      client: context.client,
      valetSessionId: context.session.valetSessionId,
      browserMarker,
    });
  };

  const confirm = async () => {
    const current = latest.current;
    // Check the captured intent against committed context, and check the cookie
    // again: another tab may promote it before React receives any notification.
    if (
      !pending ||
      current.pending !== pending ||
      !current.eligible ||
      !current.context.isFresh ||
      current.context.isMutating ||
      pending.client !== current.context.client ||
      pending.valetSessionId !== current.context.session?.valetSessionId ||
      (current.context.hasBrowserSession &&
        pending.browserMarker !== readBrowserContextMarker())
    ) {
      close();
      return;
    }
    const ok = await current.context.requestVehicle();
    if (ok) close();
  };

  return { isOpen: matches, open, close, confirm };
}
