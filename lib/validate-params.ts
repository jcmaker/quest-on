import { errorJson } from "@/lib/api-response";
import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a route parameter is a valid UUID.
 * Returns null if valid, or an error NextResponse if invalid.
 *
 * Usage:
 *   const invalid = validateUUID(examId, "examId");
 *   if (invalid) return invalid;
 */
export function validateUUID(
  value: string | undefined,
  paramName: string
): NextResponse | null {
  if (!value || !UUID_RE.test(value)) {
    return errorJson(
      "INVALID_PARAM",
      `Invalid ${paramName}: must be a valid UUID`,
      400
    );
  }
  return null;
}
