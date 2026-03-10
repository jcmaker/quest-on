import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedStudentProfile,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("GET/POST /api/student/profile", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── GET ──

  test("GET: returns null when no profile exists", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.get("/api/student/profile");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.profile).toBeNull();
  });

  test("GET: returns profile when it exists", async ({ studentRequest }) => {
    await seedStudentProfile("test-student-id", {
      name: "Kim Student",
      student_number: "2024-1234",
      school: "Seoul National University",
    });

    const res = await studentRequest.get("/api/student/profile");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.profile).toBeTruthy();
    expect(body.profile.name).toBe("Kim Student");
    expect(body.profile.student_number).toBe("2024-1234");
    expect(body.profile.school).toBe("Seoul National University");
  });

  test("GET: instructor blocked", async ({ instructorRequest }) => {
    const res = await instructorRequest.get("/api/student/profile");

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("STUDENT_ACCESS_REQUIRED");
  });

  test("GET: anon blocked", async ({ anonRequest }) => {
    const res = await anonRequest.get("/api/student/profile");

    expect(res.status()).toBe(401);
  });

  // ── POST ──

  test("POST: create profile", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/student/profile", {
      data: {
        name: "New Student",
        student_number: "2024-5678",
        school: "Korea University",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.profile).toBeTruthy();
    expect(body.profile.name).toBe("New Student");
    expect(body.profile.student_number).toBe("2024-5678");
    expect(body.profile.school).toBe("Korea University");
  });

  test("POST: upsert existing profile", async ({ studentRequest }) => {
    // Create initial profile
    await seedStudentProfile("test-student-id", {
      name: "Old Name",
      student_number: "2024-0001",
      school: "Old School",
    });

    // Update via POST
    const res = await studentRequest.post("/api/student/profile", {
      data: {
        name: "Updated Name",
        student_number: "2024-9999",
        school: "New School",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.profile.name).toBe("Updated Name");
    expect(body.profile.student_number).toBe("2024-9999");
    expect(body.profile.school).toBe("New School");
  });

  test("POST: missing required fields returns 400", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.post("/api/student/profile", {
      data: { name: "Only Name" },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("MISSING_FIELDS");
  });

  test("POST: instructor blocked", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/student/profile", {
      data: {
        name: "Test",
        student_number: "1234",
        school: "Test School",
      },
    });

    expect(res.status()).toBe(403);
  });
});
