export interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

export function setNoStoreResponseHeaders(response: HeaderResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
}
