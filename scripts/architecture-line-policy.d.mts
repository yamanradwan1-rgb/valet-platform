import type { RepositoryOwnership } from "./architecture-repository-files.mjs";

export interface GrandfatherEntry {
  readonly maxLines: number;
  readonly path: string;
}

export interface LineBaseline {
  readonly grandfathered: GrandfatherEntry[];
  readonly sourceCommit: string;
  readonly version: 1;
}

export interface LinePolicyResult {
  readonly violations: string[];
  readonly warnings: string[];
}

export const AUTHORED_EXTENSIONS: ReadonlySet<string>;
export const BASELINE_SOURCE_COMMIT: string;
export const LINE_LIMIT: number;
export const TRANSITIONAL_PATHS: ReadonlySet<string>;

export function countPhysicalLines(content: string): number;
export function normalizeRepositoryPath(value: string): string;
export function isExcludedRepositoryPath(repositoryPath: string): boolean;
export function isAuthoredRepositoryPath(repositoryPath: string): boolean;
export function collectAuthoredFiles(
  repositoryRoot: string,
  ownership?: RepositoryOwnership,
): Promise<Map<string, string>>;
export function parseLineBaseline(content: string): LineBaseline;
export function evaluateLinePolicy(
  files: ReadonlyMap<string, string>,
  baseline: LineBaseline,
): LinePolicyResult;
export function evaluateHistoricalBaseline(
  baseline: LineBaseline,
  historicalFiles: ReadonlyMap<string, string | undefined>,
): string[];
export function createGrandfatherEntries(
  baseFiles: ReadonlyMap<string, string>,
): GrandfatherEntry[];
export function checkLinePolicy(
  repositoryRoot: string,
  baselinePath: string,
  historicalLoader?: (
    repositoryRoot: string,
    sourceCommit: string,
    paths: string[],
  ) => Promise<Map<string, string | undefined>>,
  currentFiles?: ReadonlyMap<string, string>,
): Promise<LinePolicyResult>;
