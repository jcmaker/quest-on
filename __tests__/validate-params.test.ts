import { describe, it, expect } from "vitest";
import { validateUUID } from "@/lib/validate-params";

describe("validateUUID", () => {
  it("returns null for valid UUID v4", () => {
    const result = validateUUID("550e8400-e29b-41d4-a716-446655440000", "testId");
    expect(result).toBeNull();
  });

  it("returns null for uppercase UUID", () => {
    const result = validateUUID("550E8400-E29B-41D4-A716-446655440000", "testId");
    expect(result).toBeNull();
  });

  it("returns error response for empty string", () => {
    const result = validateUUID("", "testId");
    expect(result).not.toBeNull();
  });

  it("returns error response for undefined", () => {
    const result = validateUUID(undefined, "testId");
    expect(result).not.toBeNull();
  });

  it("returns error response for non-UUID string", () => {
    const result = validateUUID("not-a-uuid", "testId");
    expect(result).not.toBeNull();
  });

  it("returns error response for UUID missing hyphens", () => {
    const result = validateUUID("550e8400e29b41d4a716446655440000", "testId");
    expect(result).not.toBeNull();
  });

  it("returns error response for UUID with extra chars", () => {
    const result = validateUUID("550e8400-e29b-41d4-a716-446655440000-extra", "testId");
    expect(result).not.toBeNull();
  });

  it("returns error response for SQL injection attempt", () => {
    const result = validateUUID("'; DROP TABLE exams; --", "testId");
    expect(result).not.toBeNull();
  });
});
