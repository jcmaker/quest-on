import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { listAiEvents } from "@/lib/ai-events-store";
import {
  buildAiUsageBreakdown,
  parseAiUsageFilters,
} from "@/lib/ai-analytics";

export async function GET(request: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const searchParams = request.nextUrl?.searchParams ?? new URL(request.url).searchParams;
    const filters = parseAiUsageFilters(searchParams);
    const rows = await listAiEvents(filters);
    const breakdown = buildAiUsageBreakdown(rows);

    return successJson({
      byFeature: breakdown.byFeature,
      byModel: breakdown.byModel,
      byExam: breakdown.byExam,
      ...(filters.examId ? { bySession: breakdown.bySession ?? [] } : {}),
    });
  } catch {
    return errorJson(
      "INTERNAL_ERROR",
      "Failed to fetch AI usage breakdown",
      500
    );
  }
}
