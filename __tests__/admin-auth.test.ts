import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

describe("createAdminToken", () => {
  const TEST_SECRET = "test-secret-for-hmac-signing-minimum-32-chars";

  beforeEach(() => {
    vi.stubEnv("ADMIN_SESSION_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Dynamic import to pick up mocked env each time
  async function getCreateAdminToken() {
    const mod = await import("@/lib/admin-auth");
    return mod.createAdminToken;
  }

  it("returns a string in format base64url.base64url", async () => {
    const createAdminToken = await getCreateAdminToken();
    const token = createAdminToken();

    expect(typeof token).toBe("string");
    const parts = token.split(".");
    expect(parts).toHaveLength(2);

    // Verify both parts are valid base64url
    const base64urlPattern = /^[A-Za-z0-9_-]+$/;
    expect(parts[0]).toMatch(base64urlPattern);
    expect(parts[1]).toMatch(base64urlPattern);
  });

  it("token payload contains sid, iat, and exp fields", async () => {
    const createAdminToken = await getCreateAdminToken();
    const token = createAdminToken();

    const [payloadB64] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString()
    );

    expect(payload).toHaveProperty("sid");
    expect(payload).toHaveProperty("iat");
    expect(payload).toHaveProperty("exp");
    expect(typeof payload.sid).toBe("string");
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
  });

  it("token exp is approximately 24 hours in the future", async () => {
    const createAdminToken = await getCreateAdminToken();
    const before = Date.now();
    const token = createAdminToken();
    const after = Date.now();

    const [payloadB64] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString()
    );

    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    // exp should be between (before + 24h) and (after + 24h)
    expect(payload.exp).toBeGreaterThanOrEqual(before + twentyFourHoursMs);
    expect(payload.exp).toBeLessThanOrEqual(after + twentyFourHoursMs);
  });

  it("token can be verified by recomputing HMAC signature", async () => {
    const createAdminToken = await getCreateAdminToken();
    const token = createAdminToken();

    const [payloadB64, signature] = token.split(".");

    const expectedSignature = crypto
      .createHmac("sha256", TEST_SECRET)
      .update(payloadB64)
      .digest("base64url");

    expect(signature).toBe(expectedSignature);
  });

  it("tampered token fails verification — modified payload produces different signature", async () => {
    const createAdminToken = await getCreateAdminToken();
    const token = createAdminToken();

    const [payloadB64, originalSignature] = token.split(".");

    // Decode, tamper, re-encode
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString()
    );
    payload.sid = "tampered-session-id";
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString(
      "base64url"
    );

    // Recompute signature on the original (untampered) payload to compare
    // The original signature should NOT match the tampered payload
    const signatureForTampered = crypto
      .createHmac("sha256", TEST_SECRET)
      .update(tamperedPayloadB64)
      .digest("base64url");

    expect(originalSignature).not.toBe(signatureForTampered);
  });

  it("throws error when ADMIN_SESSION_SECRET is not set", async () => {
    vi.unstubAllEnvs();
    delete process.env.ADMIN_SESSION_SECRET;

    const createAdminToken = await getCreateAdminToken();

    expect(() => createAdminToken()).toThrow("ADMIN_SESSION_SECRET or ADMIN_PASSWORD must be set.");
  });
});
