"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ManagementLocation, ManagementOrganization } from "@valet/contracts";

import {
  listActiveSupervisorScopes,
  listCompanyAdminLocations,
  listCompanyAdminOrganizations,
  listLocationManagerLocations,
  listLocationManagerOrganizations,
  resolveCompanyAdminContext,
  type SupervisorCandidate,
} from "../../lib/scope/dashboard-scope";
import { ScopeGenerationGuard, type ScopeRequestTicket } from "../../lib/scope/scope-generation";
import { scopeSourceFailureDisposition, type ScopeEntrySource } from "./scope-entry-policy";
import { resolveOrganizationSelection } from "./scope-entry-selection";
import type { ScopeEntryAuthority, ScopeEntryProps } from "./scope-entry-types";

interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

interface ActiveOrganization {
  readonly authority: ScopeEntryAuthority;
  readonly organization: ManagementOrganization;
}

interface OperationTicket {
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly request: ScopeRequestTicket;
}

const EMPTY_ORGANIZATIONS: Page<ManagementOrganization> = { items: [], nextCursor: null };
const EMPTY_LOCATIONS: Page<ManagementLocation> = { items: [], nextCursor: null };

export function useScopeEntryController({
  api,
  accessRequirement,
  identityGeneration,
  sessionGeneration,
  onMfaRequired,
  onSelect,
}: Pick<
  ScopeEntryProps,
  "api" | "accessRequirement" | "identityGeneration" | "sessionGeneration" | "onMfaRequired" | "onSelect"
>) {
  const [guard] = useState(() => new ScopeGenerationGuard());
  const identityRef = useRef(identityGeneration);
  const sessionRef = useRef(sessionGeneration);
  const onMfaRequiredRef = useRef(onMfaRequired);
  const onSelectRef = useRef(onSelect);
  const [reloadGeneration, setReloadGeneration] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [companyAdminOrganizations, setCompanyAdminOrganizations] = useState(EMPTY_ORGANIZATIONS);
  const [locationManagerOrganizations, setLocationManagerOrganizations] = useState(EMPTY_ORGANIZATIONS);
  const [supervisorScopes, setSupervisorScopes] = useState<readonly SupervisorCandidate[]>([]);
  const [activeOrganization, setActiveOrganization] = useState<ActiveOrganization | null>(null);
  const [commercialUnavailableOrganizationId, setCommercialUnavailableOrganizationId] = useState<string | null>(null);
  const [locations, setLocations] = useState(EMPTY_LOCATIONS);

  useLayoutEffect(() => {
    identityRef.current = identityGeneration;
    sessionRef.current = sessionGeneration;
    guard.invalidate();
  }, [guard, identityGeneration, sessionGeneration]);

  useLayoutEffect(() => {
    onMfaRequiredRef.current = onMfaRequired;
    onSelectRef.current = onSelect;
  }, [onMfaRequired, onSelect]);

  const begin = useCallback((): OperationTicket => ({
    identityGeneration: identityRef.current,
    sessionGeneration: sessionRef.current,
    request: guard.begin(),
  }), [guard]);

  const isCurrent = useCallback((ticket: OperationTicket) => (
    ticket.identityGeneration === identityRef.current && guard.isCurrent(ticket.request)
    && ticket.sessionGeneration === sessionRef.current
  ), [guard]);

  const disposition = useCallback((source: ScopeEntrySource, reason: unknown) => {
    const result = scopeSourceFailureDisposition(source, reason);
    if (result === "MFA_REQUIRED") onMfaRequiredRef.current();
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      const ticket = begin();
      setPending(true);
      setError(false);
      setCompanyAdminOrganizations(EMPTY_ORGANIZATIONS);
      setLocationManagerOrganizations(EMPTY_ORGANIZATIONS);
      setSupervisorScopes([]);
      setActiveOrganization(null);
      setCommercialUnavailableOrganizationId(null);
      setLocations(EMPTY_LOCATIONS);
      const results = await Promise.allSettled([
        listCompanyAdminOrganizations(api, {}, ticket.request.signal),
        listLocationManagerOrganizations(api, {}, ticket.request.signal),
        accessRequirement === "FOUNDATION_ENTRY"
          ? listActiveSupervisorScopes(api, ticket.request.signal)
          : Promise.resolve([] as readonly SupervisorCandidate[]),
      ]);
      if (!isCurrent(ticket)) return;
      const [companyAdmin, locationManager, supervisor] = results;
      let hasError = false;
      if (companyAdmin?.status === "fulfilled") setCompanyAdminOrganizations(companyAdmin.value);
      else if (companyAdmin && disposition("COMPANY_ADMIN", companyAdmin.reason) === "ERROR") hasError = true;
      if (locationManager?.status === "fulfilled") setLocationManagerOrganizations(locationManager.value);
      else if (locationManager && disposition("LOCATION_MANAGER", locationManager.reason) === "ERROR") hasError = true;
      if (supervisor?.status === "fulfilled") setSupervisorScopes(supervisor.value);
      else if (supervisor && disposition("SUPERVISOR", supervisor.reason) === "ERROR") hasError = true;
      setError(hasError);
      setPending(false);
    });

    return () => {
      cancelled = true;
      guard.invalidate();
    };
  }, [
    api,
    begin,
    accessRequirement,
    disposition,
    guard,
    identityGeneration,
    isCurrent,
    reloadGeneration,
    sessionGeneration,
  ]);

  const loadMoreOrganizations = useCallback(async (authority: ScopeEntryAuthority) => {
    const page = authority === "COMPANY_ADMIN" ? companyAdminOrganizations : locationManagerOrganizations;
    if (page.nextCursor === null) return;
    const ticket = begin();
    setPending(true);
    setError(false);
    try {
      const next = authority === "COMPANY_ADMIN"
        ? await listCompanyAdminOrganizations(api, { cursor: page.nextCursor }, ticket.request.signal)
        : await listLocationManagerOrganizations(api, { cursor: page.nextCursor }, ticket.request.signal);
      if (!isCurrent(ticket)) return;
      const merged = { items: [...page.items, ...next.items], nextCursor: next.nextCursor };
      if (authority === "COMPANY_ADMIN") setCompanyAdminOrganizations(merged);
      else setLocationManagerOrganizations(merged);
    } catch (reason: unknown) {
      if (!isCurrent(ticket)) return;
      const action = disposition(authority, reason);
      if (action === "EMPTY" || action === "MFA_REQUIRED") {
        if (authority === "COMPANY_ADMIN") setCompanyAdminOrganizations(EMPTY_ORGANIZATIONS);
        else setLocationManagerOrganizations(EMPTY_ORGANIZATIONS);
        if (activeOrganization?.authority === authority) {
          setActiveOrganization(null);
          setCommercialUnavailableOrganizationId(null);
          setLocations(EMPTY_LOCATIONS);
        }
      } else if (action === "ERROR") setError(true);
    } finally {
      if (isCurrent(ticket)) setPending(false);
    }
  }, [activeOrganization, api, begin, companyAdminOrganizations, disposition, isCurrent, locationManagerOrganizations]);

  const selectOrganization = useCallback(async (
    authority: ScopeEntryAuthority,
    organization: ManagementOrganization,
  ) => {
    const ticket = begin();
    setPending(true);
    setError(false);
    setActiveOrganization({ authority, organization });
    setCommercialUnavailableOrganizationId(null);
    setLocations(EMPTY_LOCATIONS);
    try {
      const selection = await resolveOrganizationSelection(
        api,
        authority,
        organization,
        accessRequirement,
        ticket.request.signal,
      );
      if (!isCurrent(ticket)) return;
      if (selection.kind === "SELECT") {
        onSelectRef.current(selection.scope);
      } else if (selection.kind === "LOCATIONS") {
        setLocations(selection.page);
      } else if (selection.kind === "UNAVAILABLE") {
        setCommercialUnavailableOrganizationId(organization.organizationId);
      } else {
        setActiveOrganization(null);
      }
    } catch (reason: unknown) {
      if (!isCurrent(ticket)) return;
      const action = disposition(authority, reason);
      if (action === "EMPTY" || action === "MFA_REQUIRED") {
        setActiveOrganization(null);
        setCommercialUnavailableOrganizationId(null);
        setLocations(EMPTY_LOCATIONS);
      } else if (action === "ERROR") setError(true);
    } finally {
      if (isCurrent(ticket)) setPending(false);
    }
  }, [api, accessRequirement, begin, disposition, isCurrent]);

  const loadMoreLocations = useCallback(async () => {
    if (activeOrganization === null || locations.nextCursor === null) return;
    const ticket = begin();
    setPending(true);
    setError(false);
    const { authority, organization } = activeOrganization;
    try {
      const next = authority === "COMPANY_ADMIN"
        ? await listCompanyAdminLocations(api, organization.organizationId, { cursor: locations.nextCursor }, ticket.request.signal)
        : await listLocationManagerLocations(api, organization.organizationId, { cursor: locations.nextCursor }, ticket.request.signal);
      if (isCurrent(ticket)) setLocations({ items: [...locations.items, ...next.items], nextCursor: next.nextCursor });
    } catch (reason: unknown) {
      if (!isCurrent(ticket)) return;
      const action = disposition(authority, reason);
      if (action === "EMPTY" || action === "MFA_REQUIRED") {
        setActiveOrganization(null);
        setCommercialUnavailableOrganizationId(null);
        setLocations(EMPTY_LOCATIONS);
      } else if (action === "ERROR") setError(true);
    } finally {
      if (isCurrent(ticket)) setPending(false);
    }
  }, [activeOrganization, api, begin, disposition, isCurrent, locations]);

  const selectCompanyAdminScope = useCallback(async (location: ManagementLocation | null) => {
    if (activeOrganization?.authority !== "COMPANY_ADMIN") return;
    if (commercialUnavailableOrganizationId === activeOrganization.organization.organizationId) return;
    const ticket = begin();
    setPending(true);
    setError(false);
    try {
      const scope = location === null
        ? { kind: "ALL_LOCATIONS" as const }
        : { kind: "LOCATION" as const, locationId: location.locationId };
      const context = await resolveCompanyAdminContext(
        api,
        activeOrganization.organization.organizationId,
        scope,
        ticket.request.signal,
      );
      if (isCurrent(ticket)) onSelectRef.current({ authority: "COMPANY_ADMIN", context });
    } catch (reason: unknown) {
      if (!isCurrent(ticket)) return;
      const action = disposition("COMPANY_ADMIN", reason);
      if (action === "EMPTY" || action === "MFA_REQUIRED") {
        setActiveOrganization(null);
        setCommercialUnavailableOrganizationId(null);
        setLocations(EMPTY_LOCATIONS);
      } else if (action === "ERROR") setError(true);
    } finally {
      if (isCurrent(ticket)) setPending(false);
    }
  }, [activeOrganization, api, begin, commercialUnavailableOrganizationId, disposition, isCurrent]);

  const selectLocationManagerScope = useCallback((location: ManagementLocation) => {
    if (activeOrganization?.authority !== "LOCATION_MANAGER" || location.status !== "ACTIVE") return;
    guard.begin();
    onSelectRef.current({ authority: "LOCATION_MANAGER", organization: activeOrganization.organization, location });
  }, [activeOrganization, guard]);

  const selectSupervisorScope = useCallback((context: SupervisorCandidate) => {
    guard.begin();
    onSelectRef.current({ authority: "SUPERVISOR", context });
  }, [guard]);

  return {
    activeOrganization,
    companyAdminOrganizations,
    commercialUnavailableOrganizationId,
    error,
    locations,
    locationManagerOrganizations,
    pending,
    supervisorScopes,
    loadMoreLocations,
    loadMoreOrganizations,
    retry: () => setReloadGeneration((current) => current + 1),
    selectCompanyAdminScope,
    selectLocationManagerScope,
    selectOrganization,
    selectSupervisorScope,
  };
}
