import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, type RateLimitConfig } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  const config: RateLimitConfig = { limit: 3, windowSec: 60 };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first request is allowed with correct remaining count", () => {
    const result = checkRateLimit("test-first", config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // limit (3) - 1
  });

  it("multiple requests up to limit are all allowed", () => {
    const key = "test-up-to-limit";
    for (let i = 0; i < config.limit; i++) {
      const result = checkRateLimit(key, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(config.limit - 1 - i);
    }
  });

  it("request at limit+1 is denied", () => {
    const key = "test-over-limit";
    for (let i = 0; i < config.limit; i++) {
      checkRateLimit(key, config);
    }
    const denied = checkRateLimit(key, config);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it("different keys do not interfere with each other", () => {
    const keyA = "test-key-a";
    const keyB = "test-key-b";

    // Exhaust limit for key A
    for (let i = 0; i < config.limit; i++) {
      checkRateLimit(keyA, config);
    }
    const deniedA = checkRateLimit(keyA, config);
    expect(deniedA.allowed).toBe(false);

    // Key B should still be allowed
    const resultB = checkRateLimit(keyB, config);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(config.limit - 1);
  });

  it("resetAt is in the future (now + windowSec * 1000)", () => {
    vi.useFakeTimers();
    const now = Date.now();

    const result = checkRateLimit("test-reset-at", config);
    expect(result.resetAt).toBe(now + config.windowSec * 1000);
  });

  it("after window expires, requests are allowed again", () => {
    vi.useFakeTimers();
    const key = "test-window-expiry";

    // Exhaust the limit
    for (let i = 0; i < config.limit; i++) {
      checkRateLimit(key, config);
    }
    const denied = checkRateLimit(key, config);
    expect(denied.allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(config.windowSec * 1000 + 1);

    // Should be allowed again
    const result = checkRateLimit(key, config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(config.limit - 1);
  });
});
