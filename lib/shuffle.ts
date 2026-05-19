/**
 * Deterministic, seeded permutations — used to shuffle MCQ option order at
 * exam time. Pure functions, no dependencies, no persistence.
 *
 * The same `(seed, length)` pair always yields the identical array, so a
 * student sees the same option order on every render / reload / device.
 */

/** FNV-1a 32-bit string hash. Pure, deterministic. */
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit range
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 PRNG — returns a function yielding floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Return a deterministic permutation of `[0 .. length-1]` seeded from `seed`.
 *
 * Implementation: FNV-1a hash → mulberry32 PRNG → Fisher-Yates shuffle.
 * Same `(seed, length)` ⇒ identical array on every call.
 */
export function seededOptionOrder(seed: string, length: number): number[] {
  const order = Array.from({ length: Math.max(0, length) }, (_, i) => i);
  if (order.length < 2) return order;

  const rand = mulberry32(fnv1aHash(seed));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
