"use client";

import { useEffect, useRef, useState } from "react";
import {
  arrivalAlertForLocation, demoLocations, filterAttention, organizationAlert,
  presenceExpiryAlert, roleScopedAlerts, scopedAlerts, sortAlerts, thresholdAlert,
  type DemoLocation,
} from "./fixtures";
import type { Connection, DemoRole, Scenario, SyntheticAlert } from "./types";

export type PreviewStatus = "ready" | "loading" | "slow" | "failure" | "unavailable" | "unauthorized";

export function useAlertLab(initial: {
  readonly scenario?: Scenario;
  readonly location?: DemoLocation;
  readonly role?: DemoRole;
} = {}) {
  const initialScenario = initial.scenario ?? "multiple";
  const initialLocation = initial.location ?? "downtown";
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const [location, setLocation] = useState<DemoLocation>(initialLocation);
  const [role, setRole] = useState<DemoRole>(initial.role ?? "company-admin");
  const [connection, setConnection] = useState<Connection>("connected");
  const [status, setStatus] = useState<PreviewStatus>("ready");
  const [alerts, setAlerts] = useState<SyntheticAlert[]>(() => scopedAlerts(initialScenario, initialLocation));
  const [organizationEvent, setOrganizationEvent] = useState<SyntheticAlert | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [seenFailure, setSeenFailure] = useState<string | null>(null);
  const [failNextSeen, setFailNextSeen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [changeVersion, setChangeVersion] = useState(0);
  const generation = useRef(0);
  const sequence = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const active = timers.current;
    return () => { active.forEach(clearTimeout); };
  }, []);

  function cancelPending() {
    generation.current += 1;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPendingId(null);
    setSeenFailure(null);
  }

  function schedule(callback: () => void, ms: number) {
    const currentGeneration = generation.current;
    const timer = setTimeout(() => {
      timers.current = timers.current.filter((entry) => entry !== timer);
      if (currentGeneration === generation.current) callback();
    }, ms);
    timers.current.push(timer);
  }

  function selectScenario(next: Scenario) {
    cancelPending();
    setScenario(next);
    if (next === "empty" || next === "one" || next === "multiple" ||
        next === "overflow" || next === "destination-unavailable") {
      setAlerts(scopedAlerts(next, location));
      setSeen((previous) => new Set([...previous].filter((id) => id === organizationAlert.id)));
      setStatus("ready");
    } else {
      // Transport failure/loading must not invent a newly confirmed count or undo Seen.
      setStatus(next);
    }
    setChangeVersion((version) => version + 1);
    if (next === "slow") schedule(() => setStatus("ready"), 2100);
  }

  function selectLocation(next: DemoLocation) {
    if (next === location) return;
    // Synthetic scope change invalidates all pending callbacks and previous source detail.
    cancelPending();
    setLocation(next);
    setIsOpen(false);
    setSeen((previous) => new Set([...previous].filter((id) => id === organizationAlert.id)));
    setAlerts(scopedAlerts(scenario, next));
    setStatus(connection !== "connected" || scenario === "failure" || scenario === "unavailable"
      ? "unavailable" : scenario === "loading" ? "loading"
        : scenario === "slow" ? "slow" : "ready");
    setChangeVersion((version) => version + 1);
    if (scenario === "slow") schedule(() => setStatus("ready"), 2100);
  }

  function selectRole(next: DemoRole) {
    if (next === role) return;
    cancelPending();
    setRole(next);
    setChangeVersion((version) => version + 1);
  }

  function selectConnection(next: Connection) {
    cancelPending();
    setConnection(next);
    if (next === "revoked") {
      setIsOpen(false);
    }
    if (next === "connected") {
      setStatus("ready");
      setChangeVersion((version) => version + 1);
    }
  }

  function reconnect() {
    selectConnection("reconnecting");
    schedule(() => {
      setConnection("connected");
      setStatus("ready");
      setChangeVersion((version) => version + 1);
    }, 900);
  }

  function refresh() {
    if (connection !== "connected") return;
    setStatus("loading");
    schedule(() => {
      setStatus("ready");
      setChangeVersion((version) => version + 1);
    }, 450);
  }

  function addArrival() {
    if (connection !== "connected") return;
    sequence.current += 1;
    const newAlert = {
      ...arrivalAlertForLocation(location),
      id: `SIM-${location.toUpperCase()}-INC-LIVE-${sequence.current}`,
    };
    setAlerts((previous) => sortAlerts([newAlert, ...previous]));
    setStatus("ready");
    setChangeVersion((version) => version + 1);
  }

  function addOrganizationEvent() {
    if (role !== "company-admin" || connection !== "connected" || organizationEvent !== null) return;
    setOrganizationEvent({ ...organizationAlert, location: null });
    setStatus("ready");
    setChangeVersion((version) => version + 1);
  }

  function simulatePresenceExpiry() {
    if (connection !== "connected") return;
    const id = `SIM-${location.toUpperCase()}-PRESENCE-EXPIRY`;
    const expiresAt = new Date(Date.now() + 1600).toISOString();
    const event = {
      ...presenceExpiryAlert,
      id,
      location: demoLocations[location],
      expiresAt,
    };
    setAlerts((previous) => sortAlerts([
      ...previous.filter((item) => item.id !== id),
      event,
    ]));
    setStatus("ready");
    setChangeVersion((version) => version + 1);
    schedule(() => setChangeVersion((version) => version + 1), 1800);
  }

  function expireOccurrenceWindow() {
    if (connection !== "connected") return;
    const expiredAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1).toISOString();
    setAlerts((previous) => {
      const target = previous.find((item) => item.kind === "OCCURRENCE" && !seen.has(item.id));
      return target
        ? previous.map((item) => item.id === target.id ? { ...item, time: expiredAt } : item)
        : previous;
    });
    setChangeVersion((version) => version + 1);
  }

  function resolveActive() {
    if (connection !== "connected") return;
    setAlerts((previous) => {
      const firstActive = previous.find((alert) => alert.kind === "ACTIVE");
      return firstActive ? previous.filter((alert) => alert.id !== firstActive.id) : previous;
    });
    setChangeVersion((version) => version + 1);
  }

  function withdrawOccurrence() {
    if (connection !== "connected") return;
    setAlerts((previous) => {
      const firstEvent = previous.find((alert) => alert.kind === "OCCURRENCE");
      return firstEvent ? previous.filter((alert) => alert.id !== firstEvent.id) : previous;
    });
    setChangeVersion((version) => version + 1);
  }

  function crossThreshold() {
    if (connection !== "connected") return;
    schedule(() => {
      const source = {
        ...thresholdAlert,
        id: `SIM-${location.toUpperCase()}-RET-TIMER`,
        location: demoLocations[location],
      };
      setAlerts((previous) =>
        previous.some((alert) => alert.id === source.id)
          ? previous : sortAlerts([source, ...previous]));
      setStatus("ready");
      setChangeVersion((version) => version + 1);
    }, 2500);
  }

  function burst() {
    if (connection !== "connected") return;
    for (let index = 0; index < 3; index += 1) {
      schedule(addArrival, index * 280);
    }
  }

  function markSeen(alert: SyntheticAlert) {
    if (alert.kind !== "OCCURRENCE" || seen.has(alert.id) ||
        pendingId !== null || status !== "ready" || connection !== "connected" ||
        (alert.category === "ALT-15" && role !== "company-admin")) return;
    setPendingId(alert.id);
    setSeenFailure(null);
    const shouldFail = failNextSeen;
    setFailNextSeen(false);
    schedule(() => {
      setPendingId(null);
      if (shouldFail) {
        setSeenFailure(alert.id);
        return;
      }
      setSeen((previous) => new Set(previous).add(alert.id));
      setChangeVersion((version) => version + 1);
    }, 720);
  }

  const roleScoped = roleScopedAlerts(
    alerts,
    organizationEvent ? [organizationEvent] : [],
    role,
  );
  const attention = sortAlerts(filterAttention(roleScoped, seen));
  const count = attention.length;
  const effectiveStatus: PreviewStatus = role === "unauthorized" ? "unauthorized" : status;

  return {
    scenario, selectScenario, location, selectLocation, role, selectRole,
    organizationEvent, addOrganizationEvent, simulatePresenceExpiry, expireOccurrenceWindow,
    connection, selectConnection, reconnect, status: effectiveStatus,
    attention, count, seen, pendingId, seenFailure, markSeen, failNextSeen,
    setFailNextSeen, isOpen, setIsOpen, addArrival, resolveActive, withdrawOccurrence, crossThreshold,
    burst, refresh, changeVersion,
  };
}
