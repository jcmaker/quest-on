import { createClient } from "@supabase/supabase-js";

export type AuditAction =
  | "grade_update"
  | "exam_status_change"
  | "exam_delete"
  | "session_submit";

interface AuditLogParams {
  action: AuditAction;
  userId: string;
  targetId: string;
  details?: Record<string, unknown>;
}

/**
 * audit_logs 테이블에 감사 로그를 기록합니다.
 * 서버 사이드 전용 (Service Role Key 사용).
 */
export async function auditLog({
  action,
  userId,
  targetId,
  details,
}: AuditLogParams): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("[audit] Missing Supabase environment variables");
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { error } = await supabase.from("audit_logs").insert({
      action,
      user_id: userId,
      target_id: targetId,
      details: details ?? null,
    });

    if (error) {
      console.error("[audit] Failed to insert audit log:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[audit] Error in auditLog:", error);
    return false;
  }
}
