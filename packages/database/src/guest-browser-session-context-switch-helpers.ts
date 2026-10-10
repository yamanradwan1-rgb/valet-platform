import type { Client } from "pg";

export interface BrowserPair {
  readonly browser: string;
  readonly enrollment: string;
}

interface PreparedSwitch extends BrowserPair {
  readonly marker: string;
}

export async function prepareGuestBrowserContext(
  client: Client,
  targetToken: string,
  sourceBrowser: string,
  transition: BrowserPair,
): Promise<{
  readonly result: string;
  readonly scope: string | null;
  readonly transition: PreparedSwitch;
}> {
  const result = await client.query<{
    authority_scope: string | null;
    browser_context_marker: string | null;
    result_code: string;
  }>(
    `SELECT result_code, authority_scope, browser_context_marker
     FROM guest_browser_prepare_context($1,$2,$3,$4)`,
    [targetToken, sourceBrowser, transition.enrollment, transition.browser],
  );
  return {
    result: result.rows[0]?.result_code ?? "MISSING",
    scope: result.rows[0]?.authority_scope ?? null,
    transition: {
      ...transition,
      marker: result.rows[0]?.browser_context_marker ?? "",
    },
  };
}

export async function switchGuestBrowserContext(
  client: Client,
  targetToken: string,
  sourceBrowser: string,
  transition: BrowserPair,
): Promise<string> {
  const result = await client.query<{ result_code: string }>(
    "SELECT result_code FROM guest_browser_switch_context($1,$2,$3,$4)",
    [targetToken, sourceBrowser, transition.enrollment, transition.browser],
  );
  return result.rows[0]?.result_code ?? "MISSING";
}

export async function resolveGuestBrowserContext(
  client: Client,
  browser: string,
): Promise<string> {
  const result = await client.query<{
    authority_scope: string | null;
    result_code: string;
  }>(
    "SELECT result_code,authority_scope FROM guest_browser_resolve($1,TRUE)",
    [browser],
  );
  const row = result.rows[0];
  return row?.result_code === "OK"
    ? `OK:${row.authority_scope}`
    : (row?.result_code ?? "MISSING");
}
