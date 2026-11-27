/** Internal transport options shared by Guest API operation methods. */
export interface GuestRequestOptions {
  method?: "GET" | "POST" | undefined;
  body?: unknown;
  signal?: AbortSignal | undefined;
  omitAuthorization?: boolean | undefined;
  requireBrowserCsrf?: boolean | undefined;
  allowBrowserContextChange?: boolean | undefined;
}
