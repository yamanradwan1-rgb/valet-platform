import type { StaffVehicleDirectoryResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { fetchStaffVehicleDirectory } from "./vehicles-directory-api";

export type VehicleDirectoryPhase = "idle" | "loading" | "ready" | "error";

export interface VehicleDirectoryState {
  readonly error: Error | null;
  /** True only while fetching with no authoritative page to show yet. */
  readonly isLoading: boolean;
  /** Refetching while a previously loaded page stays truthfully visible. */
  readonly isRefreshing: boolean;
  readonly response: StaffVehicleDirectoryResponse | null;
}

export function initialVehicleDirectoryState(): VehicleDirectoryState {
  return {
    error: null,
    isLoading: false,
    isRefreshing: false,
    response: null,
  };
}

export interface VehicleDirectoryLoaderOptions {
  readonly client: EmployeeApiClient;
  readonly onStateChange?: ((state: VehicleDirectoryState) => void) | undefined;
}

/**
 * Read-model loader for the vehicle directory (DEC-066 §6/§9, DEC-063):
 * sequence-guarded authoritative fetches for one Location scope. A stale
 * in-flight response never overwrites a newer one; a failed refresh keeps the
 * previously loaded page visible next to an explicit error — offline success
 * is never faked. Strict contract violations land in the error state.
 */
export class VehicleDirectoryLoader {
  private client: EmployeeApiClient;
  private onStateChange:
    | ((state: VehicleDirectoryState) => void)
    | undefined;

  private abortController: AbortController | null = null;
  private activeSeq = 0;
  private destroyed = false;
  private state: VehicleDirectoryState = initialVehicleDirectoryState();

  constructor(options: VehicleDirectoryLoaderOptions) {
    this.client = options.client;
    this.onStateChange = options.onStateChange;
  }

  public getState(): VehicleDirectoryState {
    return this.state;
  }

  public setClient(client: EmployeeApiClient): void {
    this.client = client;
  }

  public async load(locationId: string): Promise<void> {
    if (this.destroyed) return;

    this.abortActiveRequest();
    const seq = ++this.activeSeq;
    const hasPage = this.state.response !== null;
    const sameScope =
      this.state.response?.locationId === locationId || !hasPage;

    this.setState({
      error: null,
      isLoading: !hasPage,
      isRefreshing: hasPage && sameScope,
      response: hasPage && sameScope ? this.state.response : null,
    });

    const abortController = new AbortController();
    this.abortController = abortController;

    try {
      const page = await fetchStaffVehicleDirectory(this.client, locationId, {
        signal: abortController.signal,
      });
      if (
        this.destroyed ||
        abortController.signal.aborted ||
        seq !== this.activeSeq
      ) {
        return;
      }
      // Truthfulness guard: the server echoes the requested selector. A
      // mismatched echo would silently mislabel another Location's rows.
      if (page.locationId !== locationId) {
        throw new Error("Vehicle directory responded for another location.");
      }
      this.setState({
        error: null,
        isLoading: false,
        isRefreshing: false,
        response: page,
      });
    } catch (err: unknown) {
      if (
        this.destroyed ||
        abortController.signal.aborted ||
        seq !== this.activeSeq
      ) {
        return;
      }
      // A failed refresh keeps the page already held for this exact scope
      // truthfully visible next to the error — offline success is never
      // faked, and neither is previously proven data silently discarded.
      const stalePage =
        this.state.response !== null &&
        this.state.response.locationId === locationId;
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
        isLoading: false,
        isRefreshing: false,
        response: stalePage ? this.state.response : null,
      });
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    }
  }

  /**
   * Recovers the loader for the SAME component instance after an effect
   * cleanup cycle (React StrictMode mount→cleanup→remount in Next dev):
   * drops any in-flight request and clears held state while remaining fully
   * usable — onStateChange stays attached and later load() calls are
   * accepted. Genuine permanent teardown keeps using destroy().
   */
  public reset(): void {
    this.abortActiveRequest();
    this.activeSeq++;
    this.state = initialVehicleDirectoryState();
  }

  public destroy(): void {
    this.destroyed = true;
    this.abortActiveRequest();
    this.activeSeq++;
    this.onStateChange = undefined;
    this.state = initialVehicleDirectoryState();
  }

  private abortActiveRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private setState(next: VehicleDirectoryState): void {
    if (this.destroyed) return;
    this.state = next;
    this.onStateChange?.(next);
  }
}
