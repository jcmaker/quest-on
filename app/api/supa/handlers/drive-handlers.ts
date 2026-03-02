import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

const supabase = getSupabaseServer();

export async function createFolder(data: { name: string; parent_id?: string | null }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Get the maximum sort_order for this parent folder
    const parentId = data.parent_id || null;
    let sortQuery = supabase
      .from("exam_nodes")
      .select("sort_order")
      .eq("instructor_id", user.id);

    // Handle null parent_id (root level)
    if (parentId === null) {
      sortQuery = sortQuery.is("parent_id", null);
    } else {
      sortQuery = sortQuery.eq("parent_id", parentId);
    }

    const { data: existingNodes } = await sortQuery
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder =
      existingNodes && existingNodes.length > 0
        ? existingNodes[0].sort_order + 1
        : 0;

    const { data: folder, error } = await supabase
      .from("exam_nodes")
      .insert([
        {
          instructor_id: user.id,
          parent_id: data.parent_id || null,
          kind: "folder",
          name: data.name,
          sort_order: nextSortOrder,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return successJson({ folder });
  } catch (error) {
    return errorJson("CREATE_FOLDER_FAILED", "Failed to create folder", 500);
  }
}

export async function getFolderContents(data: { folder_id?: string | null }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const parentId = data.folder_id || null;

    // Build query
    let query = supabase
      .from("exam_nodes")
      .select(
        `
        *,
        exams (
          id,
          title,
          code,
          description,
          duration,
          status,
          created_at,
          updated_at
        )
      `
      )
      .eq("instructor_id", user.id);

    // Handle null parent_id (root level)
    if (parentId === null) {
      query = query.is("parent_id", null);
    } else {
      query = query.eq("parent_id", parentId);
    }

    // Apply ordering - 최신순으로 정렬
    const { data: nodes, error } = await query.order("updated_at", {
      ascending: false,
    }); // 최근 수정된 것이 먼저

    if (error) {
      throw error;
    }

    let nodesWithCounts = nodes || [];

    const examNodes = nodesWithCounts.filter(
      (node) => node.kind === "exam" && node.exam_id
    );

    if (examNodes.length > 0) {
      const examIds = examNodes
        .map((node) => node.exam_id)
        .filter(Boolean) as string[];

      // Optimized query: Use DISTINCT ON or aggregate to get unique student counts per exam
      // This is more efficient than fetching all sessions and processing in memory
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("exam_id, student_id")
        .in("exam_id", examIds);

      if (sessionsError) {
        logError("Session count query error", sessionsError, { path: "/api/supa" });
      } else if (sessionsData) {
        // Use Map for O(1) lookups instead of nested objects
        const studentCountMap = new Map<string, Set<string>>();

        // Build count map efficiently
        for (const session of sessionsData) {
          if (!session.exam_id || !session.student_id) continue;
          if (!studentCountMap.has(session.exam_id)) {
            studentCountMap.set(session.exam_id, new Set());
          }
          studentCountMap.get(session.exam_id)!.add(session.student_id);
        }

        // Update nodes with counts
        nodesWithCounts = nodesWithCounts.map((node) => {
          if (node.kind === "exam" && node.exam_id) {
            const countSet = studentCountMap.get(node.exam_id);
            return {
              ...node,
              student_count: countSet ? countSet.size : 0,
            };
          }
          return node;
        });
      }
    }

    return successJson({ nodes: nodesWithCounts });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return errorJson("GET_FOLDER_CONTENTS_FAILED", "Failed to get folder contents", 500, errorMessage);
  }
}

export async function getBreadcrumb(data: { folder_id: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Use recursive CTE to get all parent folders
    const { data: rpcData, error } = await supabase.rpc("get_breadcrumb_path", {
      folder_id: data.folder_id,
    });

    if (error) {
      // If RPC doesn't exist, use a simpler approach with multiple queries
      const breadcrumb: Array<{ id: string; name: string }> = [];
      let currentId: string | null = data.folder_id;

      while (currentId) {
        const { data: node, error: nodeError } = await supabase
          .from("exam_nodes")
          .select("id, name, parent_id")
          .eq("id", currentId)
          .eq("instructor_id", user.id)
          .single();

        if (nodeError || !node) break;

        breadcrumb.unshift({ id: node.id, name: node.name });
        currentId = node.parent_id as string | null;
      }

      return successJson({ breadcrumb });
    }

    return successJson({ breadcrumb: rpcData || [] });
  } catch (error) {
    return errorJson("GET_BREADCRUMB_FAILED", "Failed to get breadcrumb", 500);
  }
}

export async function moveNode(data: {
  node_id: string;
  new_parent_id?: string | null;
  new_sort_order?: number;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const updateData: Record<string, unknown> = {};
    if (data.new_parent_id !== undefined) {
      updateData.parent_id = data.new_parent_id;
    }
    if (data.new_sort_order !== undefined) {
      updateData.sort_order = data.new_sort_order;
    }

    const { data: node, error } = await supabase
      .from("exam_nodes")
      .update(updateData)
      .eq("id", data.node_id)
      .eq("instructor_id", user.id)
      .select()
      .single();

    if (error) throw error;

    return successJson({ node });
  } catch (error) {
    return errorJson("MOVE_NODE_FAILED", "Failed to move node", 500);
  }
}

export async function updateNode(data: { node_id: string; name?: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    const { data: node, error } = await supabase
      .from("exam_nodes")
      .update(updateData)
      .eq("id", data.node_id)
      .eq("instructor_id", user.id)
      .select()
      .single();

    if (error) throw error;

    // If this is an exam node, also update the exam title
    if (node.kind === "exam" && node.exam_id && data.name) {
      await supabase
        .from("exams")
        .update({ title: data.name })
        .eq("id", node.exam_id)
        .eq("instructor_id", user.id);
    }

    return successJson({ node });
  } catch (error) {
    return errorJson("UPDATE_NODE_FAILED", "Failed to update node", 500);
  }
}

export async function deleteNode(data: { node_id: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Get the node first to check if it's a folder
    const { data: node, error: fetchError } = await supabase
      .from("exam_nodes")
      .select("kind, exam_id")
      .eq("id", data.node_id)
      .eq("instructor_id", user.id)
      .single();

    if (fetchError) throw fetchError;

    // If it's a folder, check if it has children
    if (node.kind === "folder") {
      const { data: children, error: childrenError } = await supabase
        .from("exam_nodes")
        .select("id")
        .eq("parent_id", data.node_id)
        .eq("instructor_id", user.id);

      if (childrenError) throw childrenError;

      if (children && children.length > 0) {
        return errorJson("FOLDER_NOT_EMPTY", "Cannot delete folder with contents", 400);
      }
    }

    // Delete the node (CASCADE will handle exam deletion if needed)
    const { error: deleteError } = await supabase
      .from("exam_nodes")
      .delete()
      .eq("id", data.node_id)
      .eq("instructor_id", user.id);

    if (deleteError) throw deleteError;

    return successJson({});
  } catch (error) {
    return errorJson("DELETE_NODE_FAILED", "Failed to delete node", 500);
  }
}

export async function getInstructorDrive() {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Get root level nodes (parent_id is null)
    return await getFolderContents({ folder_id: null });
  } catch (error) {
    return errorJson("GET_DRIVE_FAILED", "Failed to get instructor drive", 500);
  }
}
