import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { listAiEvents } from "@/lib/ai-events-store";
import {
  parseAiUsageFilters,
  summarizeAiEvents,
} from "@/lib/ai-analytics";

export async function GET(request: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const searchParams = request.nextUrl?.searchParams ?? new URL(request.url).searchParams;
    const filters = parseAiUsageFilters(searchParams);
    const rows = await listAiEvents(filters);
    const summary = summarizeAiEvents(rows, filters.range);

    return successJson(summary);
  } catch {
    return errorJson(
      "INTERNAL_ERROR",
      "Failed to fetch AI usage summary",
      500
    );
  }
}
