interface GitExecutionResult {
  readonly stderr: Buffer | string;
  readonly stdout: Buffer | string;
}

type GitExecutor = (
  file: string,
  arguments_: readonly string[],
  options: {
    readonly encoding: "buffer";
    readonly maxBuffer: number;
    readonly timeout: number;
    readonly windowsHide: true;
  },
) => Promise<GitExecutionResult>;

export interface RepositoryOwnership {
  readonly deletedPaths: ReadonlySet<string>;
  readonly paths: readonly string[];
}

export const GENERATED_NATIVE_PREFIXES: readonly string[];
export function normalizeRepositoryPath(value: string): string;
export function isGeneratedNativePath(repositoryPath: string): boolean;
export function collectRepositoryOwnedPaths(
  repositoryRoot: string,
  execute?: GitExecutor,
): Promise<RepositoryOwnership>;
export function readRepositoryOwnedTextFiles(
  repositoryRoot: string,
  ownership: RepositoryOwnership,
  predicate?: (repositoryPath: string) => boolean,
): Promise<Map<string, string>>;
export function parseGitPathOutput(output: Buffer | string): string[];
