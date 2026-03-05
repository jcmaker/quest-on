/**
 * Server-side input sanitization utilities.
 * Uses isomorphic-dompurify for robust XSS prevention (works in both Node.js and browser).
 */

import DOMPurify from "isomorphic-dompurify";

/** Strips all HTML tags and attributes, returning plain text only */
export function sanitizeUserInput(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
