/**
 * Generate a device fingerprint for tracking concurrent access.
 * Uses crypto.getRandomValues() for unpredictable randomness.
 * Persists in localStorage across page reloads.
 */
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") {
    return "unknown";
  }

  // Try to get existing fingerprint from localStorage
  const stored = localStorage.getItem("device_fingerprint");
  if (stored) {
    return stored;
  }

  // Generate a cryptographically random component
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const deviceId = `device_${randomHex}_${Date.now()}`;

  // Store in localStorage for persistence
  try {
    localStorage.setItem("device_fingerprint", deviceId);
  } catch {
    // localStorage might not be available in some environments
  }

  return deviceId;
}
