import type { StaffAuthClient } from "../../../lib/auth/staff-auth-client";
import { dashboardAuthBoundaryError } from "../../../lib/api/dashboard-api-error";
import type { PresenceApi } from "./shift-presence-api";
import type {
  PresenceIntent,
  PresenceIntentLifetime,
} from "./shift-presence-retained-intent";

/** Only explicit exact receipt GET outlives same-session refresh/UI remount. */
export async function recoverPresenceIntent(
  client: StaffAuthClient,
  lifetime: PresenceIntentLifetime,
  key: string,
  api: PresenceApi,
  intent: PresenceIntent,
) {
  const controller = new AbortController();
  const requireCurrent = () => {
    if (
      !lifetime.isCurrent() ||
      lifetime.get(key)?.mutationId !== intent.mutationId
    )
      throw dashboardAuthBoundaryError();
  };
  requireCurrent();
  const stop = client.subscribe(() => {
    if (!lifetime.isCurrent()) controller.abort(dashboardAuthBoundaryError());
  });
  try {
    if (!client.isTokenFresh()) await client.refresh(controller.signal);
    requireCurrent();
    const result = await api.result(intent.mutationId, intent.query, {
      signal: controller.signal,
      onAuthReconciled: requireCurrent,
    });
    requireCurrent();
    if (result.attribution === "COMMITTED")
      lifetime.clear(key, intent.mutationId);
    return result;
  } finally {
    stop();
  }
}
