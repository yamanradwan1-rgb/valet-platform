const patterns = {
  arbitrary_wait:
    /(?:waitForTimeout|sleep)\s*\(|new\s+Promise\s*\([^)]*setTimeout/gi,
  strict_text: /\.(?:toContainText|toHaveText|toEqualText|toHaveTitle)\s*\(/gi,
  structural_locator: /\.locator\s*\(\s*['"`][\s]*[.#>\[]/gi,
  position_locator: /\.(?:nth|first|last)\s*\(/gi,
  snapshot:
    /\.(?:toMatchSnapshot|toMatchInlineSnapshot|toHaveScreenshot)\s*\(/gi,
  implementation_calls:
    /\.(?:toHaveBeenCalledTimes|toHaveBeenNthCalledWith)\s*\(/gi,
  module_mock: /\b(?:vi|jest)\.mock\s*\(/gi,
  synthetic_ssr: /\brenderToStaticMarkup\s*\(/gi,
  mutable_global:
    /\b(?:vi|jest)\.(?:stubGlobal|setSystemTime|useFakeTimers)\s*\(/gi,
};

export function sourceSignals(source) {
  return Object.entries(patterns)
    .map(([name, regexp]) => {
      regexp.lastIndex = 0;
      const count = [...source.matchAll(regexp)].length;
      return count ? `${name}:${count}` : null;
    })
    .filter(Boolean)
    .join(";");
}
