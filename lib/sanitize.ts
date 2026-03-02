/**
 * Server-side input sanitization utilities.
 * Strips dangerous HTML patterns (XSS vectors) while preserving safe content.
 */

/** Strips script tags, event handlers, javascript: URIs, and null characters */
export function sanitizeUserInput(input: string): string {
  return input
    // Remove null characters
    .replace(/\u0000/g, "")
    // Remove <script> tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove on* event handlers (onclick, onerror, onload, etc.)
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Remove javascript: / vbscript: / data: URIs in href/src attributes
    .replace(/(href|src|action)\s*=\s*(?:"[^"]*(?:javascript|vbscript|data)\s*:[^"]*"|'[^']*(?:javascript|vbscript|data)\s*:[^']*')/gi, "")
    // Remove <iframe>, <object>, <embed>, <form>, <base> tags
    .replace(/<\/?\s*(iframe|object|embed|form|base|meta|link)\b[^>]*>/gi, "")
    // Remove style attributes with expression/url (IE CSS expression attack)
    .replace(/style\s*=\s*(?:"[^"]*expression\s*\([^"]*"|'[^']*expression\s*\([^']*')/gi, "");
}
