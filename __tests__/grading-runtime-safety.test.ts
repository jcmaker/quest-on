import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("grading runtime safety", () => {
  it("does not import isomorphic-dompurify in server grading path", () => {
    const gradingSource = readFileSync(
      join(process.cwd(), "lib", "grading.ts"),
      "utf8"
    );
    expect(gradingSource).not.toContain("isomorphic-dompurify");
  });

  it("imports grading module without jsdom dependency path", async () => {
    const gradingModule = await import("@/lib/grading");
    expect(typeof gradingModule.autoGradeSession).toBe("function");
  });
});
