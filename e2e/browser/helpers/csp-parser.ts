/**
 * CSP header parsing utilities for E2E validation.
 */

export type CSPDirectives = Record<string, string[]>;

/**
 * Parse a Content-Security-Policy header string into a directive map.
 *
 * @example
 * parseCSP("default-src 'self'; script-src 'self' https://example.com")
 * // => { "default-src": ["'self'"], "script-src": ["'self'", "https://example.com"] }
 */
export function parseCSP(header: string): CSPDirectives {
  const directives: CSPDirectives = {};

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const [name, ...values] = trimmed.split(/\s+/);
    directives[name.toLowerCase()] = values;
  }

  return directives;
}

/**
 * Assert that a CSP directive contains a specific domain/value.
 * Returns `{ pass: true }` or `{ pass: false, message }`.
 */
export function assertDirectiveContains(
  directives: CSPDirectives,
  directive: string,
  expected: string,
): { pass: boolean; message: string } {
  const values = directives[directive.toLowerCase()];

  if (!values) {
    return {
      pass: false,
      message: `CSP directive "${directive}" not found. Available: ${Object.keys(directives).join(", ")}`,
    };
  }

  const found = values.some(
    (v) =>
      v === expected ||
      v.includes(expected) ||
      // Wildcard subdomain match: *.clerk.com matches clerk.com
      (expected.startsWith("https://") &&
        v.startsWith("https://*.") &&
        expected.endsWith(v.slice("https://*.".length))),
  );

  if (!found) {
    return {
      pass: false,
      message: `CSP directive "${directive}" does not contain "${expected}". Values: ${values.join(", ")}`,
    };
  }

  return { pass: true, message: "" };
}
