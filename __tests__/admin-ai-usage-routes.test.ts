import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const {
  requireAdminMock,
  listAiEventsMock,
  listPagedAiEventsMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  listAiEventsMock: vi.fn(),
  listPagedAiEventsMock: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/ai-events-store", () => ({
  listAiEvents: listAiEventsMock,
  listPagedAiEvents: listPagedAiEventsMock,
}));

import { GET as getSummary } from "@/app/api/admin/ai-usage/summary/route";
import { GET as getBreakdown } from "@/app/api/admin/ai-usage/breakdown/route";
import { GET as getEvents } from "@/app/api/admin/ai-usage/events/route";

describe("admin ai usage routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns auth denial for summary, breakdown, and events", async () => {
    requireAdminMock.mockResolvedValue(
      NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );

    const request = new Request("http://localhost/api/admin/ai-usage/summary");

    expect((await getSummary(request as never)).status).toBe(401);
    expect((await getBreakdown(request as never)).status).toBe(401);
    expect((await getEvents(request as never)).status).toBe(401);
  });

  it("returns success payloads when admin is authorized", async () => {
    requireAdminMock.mockResolvedValue(null);
    listAiEventsMock.mockResolvedValue([]);
    listPagedAiEventsMock.mockResolvedValue({ rows: [], total: 0 });

    const summaryResponse = await getSummary(
      new Request("http://localhost/api/admin/ai-usage/summary") as never
    );
    const breakdownResponse = await getBreakdown(
      new Request("http://localhost/api/admin/ai-usage/breakdown?examId=exam-1") as never
    );
    const eventsResponse = await getEvents(
      new Request("http://localhost/api/admin/ai-usage/events?page=1&limit=10") as never
    );

    await expect(summaryResponse.json()).resolves.toMatchObject({ success: true });
    await expect(breakdownResponse.json()).resolves.toMatchObject({ success: true });
    await expect(eventsResponse.json()).resolves.toMatchObject({
      success: true,
      total: 0,
      page: 1,
      limit: 10,
    });
  });
});
