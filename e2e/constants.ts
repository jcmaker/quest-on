/**
 * Centralized test constants.
 * Import these instead of hard-coding values across test files.
 */

export const TEST_IDS = {
  INSTRUCTOR: "test-instructor-id",
  STUDENT: "test-student-id",
} as const;

export const TIMEOUTS = {
  PAGE_LOAD: 15_000,
  ELEMENT_VISIBLE: 10_000,
  API_RESPONSE: 5_000,
  DB_POLL: 5_000,
  DB_POLL_INTERVAL: 500,
  AI_RESPONSE: 30_000,
  QUICK_CHECK: 3_000,
} as const;

export const BASE_URL = "http://localhost:3000" as const;
