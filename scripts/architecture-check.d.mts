export interface ArchitectureCheckResult {
  readonly violations: string[];
  readonly warnings: string[];
}

type HistoricalLoader = (
  repositoryRoot: string,
  sourceCommit: string,
  paths: string[],
) => Promise<Map<string, string | undefined>>;

export function collectModuleSpecifiers(source: string): string[];
export function checkArchitecture(
  repositoryRoot: string,
  historicalLoader?: HistoricalLoader,
): Promise<ArchitectureCheckResult>;
