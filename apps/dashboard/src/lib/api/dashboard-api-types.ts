export interface RuntimeSchema<T> {
  safeParse(input: unknown):
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error?: unknown };
}

export interface DashboardApiRequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly signal?: AbortSignal | undefined;
  readonly requireAuth?: boolean;
  readonly onAuthReconciled?: ((generation: {
    readonly identityGeneration: number;
    readonly sessionGeneration: number;
  }) => void) | undefined;
}

export interface DashboardBinaryRequestOptions {
  readonly body: unknown;
  readonly expectedContentType: string;
  readonly signal?: AbortSignal | undefined;
}

export interface DashboardBinaryResponse {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly filename: string;
}
