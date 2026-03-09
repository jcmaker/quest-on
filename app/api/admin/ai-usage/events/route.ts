import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { listPagedAiEvents } from "@/lib/ai-events-store";
import { parseAiUsageFilters } from "@/lib/ai-analytics";

export async function GET(request: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const searchParams = request.nextUrl?.searchParams ?? new URL(request.url).searchParams;
    const rawPage = parseInt(searchParams.get("page") || "1", 10);
    const rawLimit = parseInt(searchParams.get("limit") || "25", 10);
    const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 25 : rawLimit, 1), 100);
    const filters = parseAiUsageFilters(searchParams);

    const { rows, total } = await listPagedAiEvents({
      filters,
      page,
      limit,
    });

    return successJson({
      events: rows,
      total,
      page,
      limit,
    });
  } catch {
    return errorJson(
      "INTERNAL_ERROR",
      "Failed to fetch AI usage events",
      500
    );
  }
}
