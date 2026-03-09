import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AuditAction =
  | "grade_update"
  | "exam_status_change"
  | "exam_delete"
  | "session_submit"
  | "admin_login_success"
  | "admin_login_failure";

interface AuditLogParams {
  action: AuditAction;
  userId: string;
  targetId: string;
  details?: Record<string, unknown>;
}

// Failure monitoring: track consecutive failures
let consecutiveFailures = 0;
const FAILURE_WARN_THRESHOLD = 1;

/** Critical actions that must have a fallback record if audit_logs fails */
const CRITICAL_ACTIONS = new Set<AuditAction>(["grade_update", "session_submit", "exam_delete"]);

/**
 * Fallback: write to error_logs table when audit_logs insert fails for critical events.
 * This ensures we never silently lose audit trail for grading/submission events.
 */
async function auditFallbackToErrorLogs(
  supabase: SupabaseClient,
  params: AuditLogParams,
  originalError: string
): Promise<void> {
  try {
    await supabase.from("error_logs").insert({
      error_type: "audit_log_failure",
      message: `Failed to write audit log: ${originalError}`,
      context: {
        audit_action: params.action,
        user_id: params.userId,
        target_id: params.targetId,
        details: params.details,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Last resort: console.error so it appears in Vercel logs
    console.error(
      `[audit] CRITICAL: Both audit_logs and error_logs failed for action=${params.action} target=${params.targetId}`
    );
  }
}

/**
 * audit_logs 테이블에 감사 로그를 기록합니다.
 * 서버 사이드 전용 (Service Role Key 사용).
 * 연속 실패 시 경고 로그를 출력합니다.
 * 크리티컬 이벤트 실패 시 error_logs 테이블에 fallback 기록합니다.
 */
export async function auditLog({
  action,
  userId,
  targetId,
  details,
}: AuditLogParams): Promise<boolean> {
  const params = { action, userId, targetId, details };
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      consecutiveFailures++;
      const errMsg = "missing env vars";
      if (consecutiveFailures >= FAILURE_WARN_THRESHOLD) {
        console.error(
          `[audit] WARNING: ${consecutiveFailures} consecutive audit log failures (${errMsg})`
        );
      }
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
      consecutiveFailures++;
      if (consecutiveFailures >= FAILURE_WARN_THRESHOLD) {
        console.error(
          `[audit] WARNING: ${consecutiveFailures} consecutive audit log failures. Last error: ${error.message}`
        );
      }
      if (CRITICAL_ACTIONS.has(action)) {
        await auditFallbackToErrorLogs(supabase, params, error.message);
      }
      return false;
    }

    // Reset counter on success
    consecutiveFailures = 0;
    return true;
  } catch (err) {
    consecutiveFailures++;
    const errMsg = err instanceof Error ? err.message : "unknown";
    if (consecutiveFailures >= FAILURE_WARN_THRESHOLD) {
      console.error(
        `[audit] WARNING: ${consecutiveFailures} consecutive audit log failures. Last error: ${errMsg}`
      );
    }
    // Fallback for critical actions
    if (CRITICAL_ACTIONS.has(action)) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseServiceRoleKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
          await auditFallbackToErrorLogs(supabase, params, errMsg);
        }
      } catch {
        // Already logged above
      }
    }
    return false;
  }
}
