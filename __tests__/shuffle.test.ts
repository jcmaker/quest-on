import { describe, expect, it } from "vitest";
import { seededOptionOrder } from "@/lib/shuffle";

/**
 * Coverage for the seeded MCQ option-order permutation.
 *
 * Contract:
 *  - deterministic: same (seed, length) ⇒ identical array every call
 *  - always a valid permutation of [0 .. length-1]
 *  - different seeds generally yield different orders
 */

describe("seededOptionOrder", () => {
  it("is deterministic — same seed and length produce the same order", () => {
    const a = seededOptionOrder("session-1::question-7", 4);
    const b = seededOptionOrder("session-1::question-7", 4);
    expect(a).toEqual(b);
    // also stable across many repeated calls
    for (let i = 0; i < 50; i++) {
      expect(seededOptionOrder("session-1::question-7", 4)).toEqual(a);
    }
  });

  it("returns a valid permutation for length 4", () => {
    const order = seededOptionOrder("abc", 4);
    expect(order).toHaveLength(4);
    expect([...order].sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
  });

  it("returns a valid permutation for length 2", () => {
    const order = seededOptionOrder("ox-question", 2);
    expect(order).toHaveLength(2);
    expect([...order].sort((x, y) => x - y)).toEqual([0, 1]);
  });

  it("produces a valid permutation across many seeds", () => {
    for (let i = 0; i < 200; i++) {
      const order = seededOptionOrder(`seed-${i}`, 4);
      expect([...order].sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
    }
  });

  it("different seeds generally produce different orders", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 100; i++) {
      orders.add(seededOptionOrder(`student-${i}::q1`, 4).join(","));
    }
    // With 24 possible permutations and 100 seeds we expect good spread.
    expect(orders.size).toBeGreaterThan(5);
  });

  it("handles trivial lengths without shuffling", () => {
    expect(seededOptionOrder("anything", 0)).toEqual([]);
    expect(seededOptionOrder("anything", 1)).toEqual([0]);
  });
});
