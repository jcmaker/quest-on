import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "crypto";

const COOKIE_NAME = "admin-session";
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function getAdminSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET or ADMIN_PASSWORD must be set");
  }
  return secret;
}

export function createAdminToken(): string {
  const secret = getAdminSecret();
  const payload = JSON.stringify({
    sid: crypto.randomBytes(16).toString("hex"),
    iat: Date.now(),
    exp: Date.now() + TOKEN_MAX_AGE_MS,
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

function verifyToken(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const [payloadB64, signature] = parts;
    if (!payloadB64 || !signature) return false;

    const secret = getAdminSecret();
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payloadB64)
      .digest("base64url");

    // Constant-time comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

    // Check expiration
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString()
    );
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function verifyAdminToken(): Promise<{ isAdmin: boolean }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
      return { isAdmin: false };
    }

    return { isAdmin: verifyToken(token) };
  } catch {
    return { isAdmin: false };
  }
}

/**
 * Verifies admin access and returns a 401 response if not authorized.
 * Returns null if the user is a valid admin, or a NextResponse error otherwise.
 * Usage: const denied = await requireAdmin(); if (denied) return denied;
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const { isAdmin } = await verifyAdminToken();

  if (!isAdmin) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Admin access required" },
      { status: 401 }
    );
  }
  return null;
}
