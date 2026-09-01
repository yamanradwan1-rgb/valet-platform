export interface JavaScriptEscape {
  readonly end: number;
  readonly value: string;
}

export function readJavaScriptEscape(
  source: string,
  start: number,
): JavaScriptEscape;
export function readTemplateLiteral(
  source: string,
  start: number,
): JavaScriptEscape | { readonly end: number; readonly value?: undefined };
export function skipLineComment(source: string, index: number): number;
