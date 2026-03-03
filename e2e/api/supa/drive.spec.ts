import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedExamNode,
  cleanupTestData,
} from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";

const supabase = getTestSupabase();

test.describe("Supa — Drive / Folder API", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── create_folder ──

  test("create_folder → 200, folder stored in DB", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/supa", {
      data: { action: "create_folder", data: { name: "Test Folder" } },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.folder).toBeTruthy();
    expect(body.folder.kind).toBe("folder");
    expect(body.folder.name).toBe("Test Folder");
    expect(body.folder.parent_id).toBeNull();
  });

  test("create_folder → nested folder under parent", async ({
    instructorRequest,
  }) => {
    // Create parent folder first
    const parentRes = await instructorRequest.post("/api/supa", {
      data: { action: "create_folder", data: { name: "Parent Folder" } },
    });
    const parent = (await parentRes.json()).folder;

    // Create nested folder
    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "create_folder",
        data: { name: "Child Folder", parent_id: parent.id },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.folder.parent_id).toBe(parent.id);
    expect(body.folder.name).toBe("Child Folder");
  });

  test("create_folder → 403 for student role", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/supa", {
      data: { action: "create_folder", data: { name: "Forbidden Folder" } },
    });

    // Should be forbidden (403) or similar error
    const status = res.status();
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test("create_folder → 401 for unauthenticated", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/supa", {
      data: { action: "create_folder", data: { name: "Anon Folder" } },
    });

    const status = res.status();
    expect(status).toBeGreaterThanOrEqual(400);
  });

  // ── get_folder_contents ──

  test("get_folder_contents → returns root level nodes", async ({
    instructorRequest,
  }) => {
    // Seed a folder at root level
    await seedExamNode({ name: "Root Folder", kind: "folder" });

    const res = await instructorRequest.post("/api/supa", {
      data: { action: "get_folder_contents", data: { folder_id: null } },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.nodes).toBeDefined();
    expect(Array.isArray(body.nodes)).toBe(true);
    const folderNames = body.nodes.map((n: { name: string }) => n.name);
    expect(folderNames).toContain("Root Folder");
  });

  test("get_folder_contents → returns children of a folder", async ({
    instructorRequest,
  }) => {
    const parent = await seedExamNode({ name: "Parent", kind: "folder" });
    await seedExamNode({
      name: "Child 1",
      kind: "folder",
      parent_id: parent.id,
    });
    await seedExamNode({
      name: "Child 2",
      kind: "folder",
      parent_id: parent.id,
    });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "get_folder_contents",
        data: { folder_id: parent.id },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.nodes.length).toBe(2);
    const names = body.nodes.map((n: { name: string }) => n.name);
    expect(names).toContain("Child 1");
    expect(names).toContain("Child 2");
  });

  test("get_folder_contents → 403 for student role", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.post("/api/supa", {
      data: { action: "get_folder_contents", data: { folder_id: null } },
    });

    const status = res.status();
    expect(status).toBeGreaterThanOrEqual(400);
  });

  // ── get_instructor_drive ──

  test("get_instructor_drive → returns root nodes", async ({
    instructorRequest,
  }) => {
    await seedExamNode({ name: "Drive Item", kind: "folder" });

    const res = await instructorRequest.post("/api/supa", {
      data: { action: "get_instructor_drive", data: {} },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.nodes).toBeDefined();
    const names = body.nodes.map((n: { name: string }) => n.name);
    expect(names).toContain("Drive Item");
  });

  // ── get_breadcrumb ──

  test("get_breadcrumb → returns folder path", async ({
    instructorRequest,
  }) => {
    const root = await seedExamNode({ name: "Root", kind: "folder" });
    const child = await seedExamNode({
      name: "Sub",
      kind: "folder",
      parent_id: root.id,
    });

    const res = await instructorRequest.post("/api/supa", {
      data: { action: "get_breadcrumb", data: { folder_id: child.id } },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.breadcrumb).toBeDefined();
    expect(body.breadcrumb.length).toBeGreaterThanOrEqual(1);
    const names = body.breadcrumb.map((b: { name: string }) => b.name);
    expect(names).toContain("Sub");
  });

  // ── move_node ──

  test("move_node → moves folder to new parent", async ({
    instructorRequest,
  }) => {
    const folderA = await seedExamNode({ name: "Folder A", kind: "folder" });
    const folderB = await seedExamNode({ name: "Folder B", kind: "folder" });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "move_node",
        data: { node_id: folderB.id, new_parent_id: folderA.id },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.node.parent_id).toBe(folderA.id);
  });

  // ── update_node ──

  test("update_node → renames folder", async ({ instructorRequest }) => {
    const folder = await seedExamNode({
      name: "Old Name",
      kind: "folder",
    });

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "update_node",
        data: { node_id: folder.id, name: "New Name" },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.node.name).toBe("New Name");
  });

  test("update_node → renames exam node and syncs exam title", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ title: "Original Exam Title" });

    // Find the exam node created by seedExam
    const { data: nodes } = await supabase
      .from("exam_nodes")
      .select("id")
      .eq("exam_id", exam.id)
      .single();

    const res = await instructorRequest.post("/api/supa", {
      data: {
        action: "update_node",
        data: { node_id: nodes!.id, name: "Updated Exam Title" },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.node.name).toBe("Updated Exam Title");

    // Verify exam title was synced
    const { data: updatedExam } = await supabase
      .from("exams")
      .select("title")
      .eq("id", exam.id)
      .single();
    expect(updatedExam!.title).toBe("Updated Exam Title");
  });

  // ── delete_node ──

  test("delete_node → deletes empty folder", async ({
    instructorRequest,
  }) => {
    const folder = await seedExamNode({
      name: "To Delete",
      kind: "folder",
    });

    const res = await instructorRequest.post("/api/supa", {
      data: { action: "delete_node", data: { node_id: folder.id } },
    });

    expect(res.status()).toBe(200);

    // Verify it's gone from DB
    const { data } = await supabase
      .from("exam_nodes")
      .select("id")
      .eq("id", folder.id);
    expect(data).toHaveLength(0);
  });

  test("delete_node → rejects non-empty folder", async ({
    instructorRequest,
  }) => {
    const parent = await seedExamNode({
      name: "Non-Empty Folder",
      kind: "folder",
    });
    await seedExamNode({
      name: "Child",
      kind: "folder",
      parent_id: parent.id,
    });

    const res = await instructorRequest.post("/api/supa", {
      data: { action: "delete_node", data: { node_id: parent.id } },
    });

    // Should refuse with 400 (FOLDER_NOT_EMPTY)
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("FOLDER_NOT_EMPTY");
  });

  test("delete_node → 403 for student role", async ({ studentRequest }) => {
    const folder = await seedExamNode({
      name: "Student Cant Delete",
      kind: "folder",
    });

    const res = await studentRequest.post("/api/supa", {
      data: { action: "delete_node", data: { node_id: folder.id } },
    });

    const status = res.status();
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
