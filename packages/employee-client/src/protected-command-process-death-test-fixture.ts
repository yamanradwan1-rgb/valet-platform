import { EmployeeApiError, employeeNetworkError } from "./api-error";

export type ProtectedCommandFault =
  | "before-commit"
  | "commit-response-lost"
  | "rollback"
  | { readonly commit: boolean; readonly kind: "disconnect" };

/**
 * Test-only authoritative server boundary for process-death evidence.
 *
 * The state belongs to the fake server, never to a client session. Each test
 * discards Process A and gives Process B only this boundary's canonical reads.
 */
export class ProtectedCommandServer<State> {
  readonly posts: string[] = [];
  readonly reads: string[] = [];

  constructor(private state: State) {}

  canonicalRead(label: string): State {
    this.reads.push(label);
    return structuredClone(this.state);
  }

  commitExternal(command: (draft: State) => void): void {
    const draft = structuredClone(this.state);
    command(draft);
    this.state = draft;
  }

  async mutate<Result>(
    label: string,
    fault: ProtectedCommandFault,
    command: (draft: State) => Result,
  ): Promise<Result> {
    this.posts.push(label);
    if (fault === "before-commit") throw employeeNetworkError();

    const draft = structuredClone(this.state);
    const result = command(draft);
    if (fault === "rollback") {
      throw new EmployeeApiError({
        code: "TRANSACTION_ROLLED_BACK",
        message: "The protected transaction rolled back.",
        status: 500,
      });
    }
    if (typeof fault !== "object" || fault.commit) this.state = draft;
    if (fault === "commit-response-lost" || typeof fault === "object") {
      throw employeeNetworkError();
    }
    return structuredClone(result);
  }
}

export const requiredProcessDeathFaults: readonly ProtectedCommandFault[] = [
  "before-commit",
  "commit-response-lost",
  "rollback",
  { commit: false, kind: "disconnect" },
  { commit: true, kind: "disconnect" },
];

export function faultCommitted(fault: ProtectedCommandFault): boolean {
  return (
    fault === "commit-response-lost" ||
    (typeof fault === "object" && fault.commit)
  );
}

export interface ProcessDeathCommandCut {
  readonly reached: Promise<void>;
  loseResponse<Result>(operation: Promise<Result>): Promise<Result>;
}

/**
 * Cuts the transport after the fake server decides the transaction outcome.
 * Process A remains awaiting a response that its killed process can never
 * receive, so it cannot publish or start its own canonical reconciliation.
 */
export function processDeathCommandCut(): ProcessDeathCommandCut {
  let reach!: () => void;
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  return {
    reached,
    async loseResponse<Result>(operation: Promise<Result>): Promise<Result> {
      try {
        return await operation;
      } catch {
        reach();
        return new Promise<Result>(() => undefined);
      }
    },
  };
}
