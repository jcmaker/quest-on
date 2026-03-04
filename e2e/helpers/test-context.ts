import crypto from "crypto";

/**
 * Creates a unique test context with randomized IDs.
 * Use this to isolate parallel tests from each other.
 */
export function createTestContext() {
  const suffix = crypto.randomBytes(4).toString("hex");
  return {
    instructorId: `test-instructor-${suffix}`,
    studentId: `test-student-${suffix}`,
    suffix,
  };
}
