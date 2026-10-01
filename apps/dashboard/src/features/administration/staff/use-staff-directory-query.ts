"use client";

import {
  STAFF_SEARCH_MAX_LENGTH,
  type StaffDirectoryQuery,
} from "@valet/contracts";
import { useEffect, useState } from "react";

export type StaffDirectoryFilters = Omit<
  StaffDirectoryQuery,
  "limit" | "cursor"
>;

export function useStaffDirectoryQuery() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<{
    filters: StaffDirectoryFilters;
    cursor: string | null;
    history: (string | null)[];
    generation: number;
    membershipId: string | null;
  }>({
    filters: {},
    cursor: null,
    history: [],
    generation: 0,
    membershipId: null,
  });

  const effectiveSearch = search.trim() || undefined;
  useEffect(() => {
    if (effectiveSearch === state.filters.search) return;
    const timer = setTimeout(() => {
      setState((current) => ({
        ...current,
        filters: { ...current.filters, search: effectiveSearch },
        cursor: null,
        history: [],
        membershipId: null,
        generation: current.generation + 1,
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [effectiveSearch, state.filters.search]);

  function changeFilters(filters: StaffDirectoryFilters) {
    setState((current) => ({
      ...current,
      filters: { ...current.filters, ...filters },
      cursor: null,
      history: [],
      membershipId: null,
      generation: current.generation + 1,
    }));
  }

  return {
    ...state,
    search,
    changeFilters,
    changeSearch: (value: string) => {
      setSearch(Array.from(value).slice(0, STAFF_SEARCH_MAX_LENGTH).join(""));
      if (value.trim() === "" && state.filters.search !== undefined) {
        changeFilters({ search: undefined });
      }
    },
    select: (membershipId: string | null) =>
      setState((current) => ({ ...current, membershipId })),
    next: (cursor: string) =>
      setState((current) => ({
        ...current,
        cursor,
        history: [...current.history, current.cursor],
        membershipId: null,
        generation: current.generation + 1,
      })),
    previous: () =>
      setState((current) => ({
        ...current,
        cursor: current.history.at(-1) ?? null,
        history: current.history.slice(0, -1),
        membershipId: null,
        generation: current.generation + 1,
      })),
  };
}
