import { test, expect } from "../../fixtures/auth.fixture";
import { cleanupTestData } from "../../helpers/seed";

// Minimal valid PDF buffer
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF",
  "utf-8"
);

test.describe("Upload API — /api/upload", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── Instructor (authorized) ──

  test("instructor uploads valid PDF → 201 with url", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "test-document.pdf",
          mimeType: "application/pdf",
          buffer: MINIMAL_PDF,
        },
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBeTruthy();
    expect(body.objectKey).toBeTruthy();
    expect(body.meta.originalName).toBe("test-document.pdf");
  });

  // ── Student (forbidden) ──

  test("student cannot upload → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "test.pdf",
          mimeType: "application/pdf",
          buffer: MINIMAL_PDF,
        },
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  // ── Anonymous (unauthorized) ──

  test("anon cannot upload → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "test.pdf",
          mimeType: "application/pdf",
          buffer: MINIMAL_PDF,
        },
      },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  // ── Invalid file type ──

  test("unsupported file type → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "malicious.exe",
          mimeType: "application/x-msdownload",
          buffer: Buffer.from("MZ fake exe content"),
        },
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_FILE_EXTENSION");
  });

  // ── Oversized file ──

  test("file exceeding 25MB → 413", async ({ instructorRequest }) => {
    // Create a buffer slightly over 25MB
    const oversizedBuffer = Buffer.alloc(26 * 1024 * 1024, "a");

    const res = await instructorRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "huge-file.pdf",
          mimeType: "application/pdf",
          buffer: oversizedBuffer,
        },
      },
    });

    // Either 413 (request entity too large), 400, or 500 (Next.js body size limit)
    expect([400, 413, 500]).toContain(res.status());
  });

  // ── GET method not allowed ──

  test("GET /api/upload → 405", async ({ instructorRequest }) => {
    const res = await instructorRequest.get("/api/upload");

    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });
});

test.describe("Extract Text API — /api/extract-text", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("anon cannot extract text → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/extract-text", {
      data: {
        fileUrl: "https://example.com/test.pdf",
        fileName: "test.pdf",
        mimeType: "application/pdf",
      },
    });

    expect(res.status()).toBe(401);
  });

  test("student cannot extract text → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/extract-text", {
      data: {
        fileUrl: "https://example.com/test.pdf",
        fileName: "test.pdf",
        mimeType: "application/pdf",
      },
    });

    expect(res.status()).toBe(403);
  });

  test("missing required fields → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/extract-text", {
      data: {},
    });

    expect(res.status()).toBe(400);
  });
});
