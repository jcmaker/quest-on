import { NextRequest } from "next/server";
import { errorJson } from "@/lib/api-response";

import {
  createExam,
  updateExam,
  getExam,
  getExamById,
  getInstructorExams,
  copyExam,
} from "./handlers/exam-handlers";

import {
  createOrGetSession,
  initExamSession,
  submitExam,
  sessionHeartbeat,
  deactivateSession,
} from "./handlers/session-handlers";

import {
  saveDraft,
  saveAllDrafts,
  saveDraftAnswers,
  getSessionSubmissions,
  getSessionMessages,
} from "./handlers/submission-handlers";

import {
  createFolder,
  getFolderContents,
  getBreadcrumb,
  moveNode,
  updateNode,
  deleteNode,
  getInstructorDrive,
} from "./handlers/drive-handlers";

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      return errorJson("INVALID_JSON", "Invalid JSON in request body", 400);
    }

    const { action, data } = body;

    if (!action) {
      return errorJson("MISSING_ACTION", "Missing 'action' field in request", 400);
    }

    switch (action) {
      case "create_exam":
        return await createExam(data);
      case "update_exam":
        return await updateExam(data);
      case "submit_exam":
        return await submitExam(data);
      case "get_exam":
        return await getExam(data);
      case "get_exam_by_id":
        return await getExamById(data);
      case "get_instructor_exams":
        return await getInstructorExams();
      case "create_or_get_session":
        return await createOrGetSession(data);
      case "init_exam_session": // New optimized action
        return await initExamSession(data);
      case "save_draft":
        return await saveDraft(data);
      case "save_all_drafts":
        return await saveAllDrafts(data);
      case "save_draft_answers":
        return await saveDraftAnswers(data);
      case "get_session_submissions":
        return await getSessionSubmissions(data);
      case "get_session_messages":
        return await getSessionMessages(data);
      case "session_heartbeat":
        return await sessionHeartbeat(data);
      case "deactivate_session":
        return await deactivateSession(data);
      case "create_folder":
        return await createFolder(data);
      case "get_folder_contents":
        return await getFolderContents(data);
      case "get_breadcrumb":
        return await getBreadcrumb(data);
      case "move_node":
        return await moveNode(data);
      case "update_node":
        return await updateNode(data);
      case "delete_node":
        return await deleteNode(data);
      case "get_instructor_drive":
        return await getInstructorDrive();
      case "copy_exam":
        return await copyExam(data);
      default:
        return errorJson("INVALID_ACTION", `Invalid action: ${action}`, 400);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return errorJson(
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      500,
      process.env.NODE_ENV === "development"
        ? { message: errorMessage, stack: error instanceof Error ? error.stack : undefined }
        : errorMessage
    );
  }
}
