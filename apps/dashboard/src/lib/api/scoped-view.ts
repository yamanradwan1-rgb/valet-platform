/**
 * Identity-aware scope selection for dashboard read snapshots (D5-001).
 *
 * The accepted selector-collapse pattern (`selectOverviewLoadState` /
 * `selectSetupLoadState`) factored into ONE shared primitive: every
 * location-owned snapshot is stamped with the data scope it was produced
 * for AT REQUEST TIME, and the render may only see it while that scope is
 * still current.
 *
 * This closes the audited stale-paint window on the effect-driven read
 * surfaces: those hooks reset their state in effects, so between the render
 * where the selected location becomes B and the effect that resets A's
 * data, the previous frame's settled snapshot was still handed to the view.
 * Selection happens during render — BEFORE any effect runs — so Location A
 * facts (rows, cards, errors, status, selected entities) can never be
 * returned while Location B is current.
 *
 * Stamps MUST come from request-time scope (the creating effect/request
 * closure), never from mutable refs reassigned during render, so an
 * in-flight response from A stays A-stamped even if it lands in the window
 * after B has been rendered but before A's cleanup effect ran.
 */

export interface ScopedValue<S> {
  /** Data scope the value was produced for; `null` = not scoped yet. */
  readonly ownerId: string | null;
  readonly value: S;
}

export function stampScope<S>(
  ownerId: string | null,
  value: S,
): ScopedValue<S> {
  return { ownerId, value };
}

/**
 * Returns `scoped.value` ONLY while its stamp equals the current scope.
 * Anything else — an unscoped value, an empty current selection, or a
 * value produced for a previous location — yields `neutral`, which every
 * consuming view already renders as its loading/idle skeleton.
 */
export function selectScopedValue<S>(
  scoped: ScopedValue<S>,
  currentId: string | null,
  neutral: S,
): S {
  return scoped.ownerId !== null && scoped.ownerId === currentId
    ? scoped.value
    : neutral;
}
