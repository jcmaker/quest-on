import { NextRequest, NextResponse } from "next/server";

/**
 * Allowed origins for CORS.
 * Set ALLOWED_ORIGINS env var as comma-separated list, or uses defaults.
 */
function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(",").map((o) => o.trim()).filter(Boolean);
  }

  // Default: allow same-origin and common dev origins
  return [
    "https://quest-on.vercel.app",
    "https://www.quest-on.kr",
    "https://quest-on.kr",
    "http://localhost:3000",
    "http://localhost:3001",
  ];
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (process.env.NODE_ENV === "development") return true;
  return getAllowedOrigins().includes(origin);
}

/**
 * Get CORS headers for a given request origin.
 * Returns empty object if origin is not allowed.
 */
export function getCorsHeaders(
  request: NextRequest,
  methods = "POST, OPTIONS"
): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * Handle OPTIONS preflight with proper CORS headers.
 */
export function handleCorsPreFlight(
  request: NextRequest,
  methods = "POST, OPTIONS"
): NextResponse {
  const headers = getCorsHeaders(request, methods);
  return new NextResponse(null, {
    status: 204,
    headers,
  });
}
