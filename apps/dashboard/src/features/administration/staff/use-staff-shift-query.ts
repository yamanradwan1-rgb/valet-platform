"use client";
import type { ManagementLocation } from "@valet/contracts";
import { useCallback, useState } from "react";
interface Filters {
  location: ManagementLocation | null;
  membershipId: string | undefined;
  status: "ACTIVE" | "ENDED" | undefined;
  from: string;
  to: string;
}
export function useStaffShiftQuery(initialShiftId: string | null = null) {
  const [state, setState] = useState({
    filters: {
      location: null,
      membershipId: undefined,
      status: undefined,
      from: "",
      to: "",
    } as Filters,
    cursor: null as string | null,
    history: [] as (string | null)[],
    generation: 0,
    shiftId: initialShiftId,
    detailGeneration: 0,
    selectionGeneration: 0,
  });
  const close = useCallback(
    () => setState((current) => ({ ...current, shiftId: null })),
    [],
  );
  function change(filters: Partial<Filters>) {
    setState((current) => {
      const next = { ...current.filters, ...filters };
      if (JSON.stringify(next) === JSON.stringify(current.filters))
        return current;
      return {
        ...current,
        filters: next,
        cursor: null,
        history: [],
        shiftId: null,
        generation: current.generation + 1,
      };
    });
  }
  function refresh() {
    setState((current) => ({
      ...current,
      cursor: null,
      history: [],
      shiftId: null,
      generation: current.generation + 1,
    }));
  }
  function next(cursor: string) {
    setState((current) => ({
      ...current,
      cursor,
      history: [...current.history, current.cursor],
      shiftId: null,
      generation: current.generation + 1,
    }));
  }
  function previous() {
    setState((current) => ({
      ...current,
      cursor: current.history.at(-1) ?? null,
      history: current.history.slice(0, -1),
      shiftId: null,
      generation: current.generation + 1,
    }));
  }
  function select(shiftId: string) {
    setState((current) => ({
      ...current,
      shiftId,
      detailGeneration: current.detailGeneration + 1,
      selectionGeneration: current.selectionGeneration + 1,
    }));
  }
  function reconcileSelected() {
    setState((current) => ({
      ...current,
      cursor: null,
      history: [],
      generation: current.generation + 1,
      detailGeneration: current.detailGeneration + 1,
    }));
  }
  return {
    ...state,
    change,
    refresh,
    next,
    previous,
    select,
    close,
    reconcileSelected,
  };
}
