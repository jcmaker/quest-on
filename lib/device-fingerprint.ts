/**
 * Generate a simple device fingerprint for tracking concurrent access
 * Uses localStorage to persist the fingerprint across page reloads
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

  // Generate a new fingerprint based on browser/user agent characteristics
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
    // Add a random component to make it unique per browser instance
    Math.random().toString(36).substring(2, 15),
  ].join("|");

  // Create a simple hash (not cryptographically secure, just for identification)
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  const deviceId = `device_${Math.abs(hash)}_${Date.now()}`;

  // Store in localStorage for persistence
  try {
    localStorage.setItem("device_fingerprint", deviceId);
  } catch (e) {
    // localStorage might not be available
    console.warn("Failed to store device fingerprint:", e);
  }

  return deviceId;
}
