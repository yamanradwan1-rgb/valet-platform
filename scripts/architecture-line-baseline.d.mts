interface GitExecutionResult {
  readonly stderr: string;
  readonly stdout: string;
}

type GitExecutor = (
  file: string,
  arguments_: readonly string[],
  options: {
    readonly encoding: "utf8";
    readonly maxBuffer: number;
    readonly timeout: number;
    readonly windowsHide: true;
  },
) => Promise<GitExecutionResult>;

export function loadHistoricalBaselineFiles(
  repositoryRoot: string,
  sourceCommit: string,
  paths: readonly string[],
  execute?: GitExecutor,
): Promise<Map<string, string | undefined>>;
