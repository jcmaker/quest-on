import { NextRequest, NextResponse } from "next/server";
import { searchUniversities } from "@/lib/seoul-universities";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    // limit 파라미터가 있으면 사용하고, 없으면 제한 없음 (또는 충분히 큰 값)
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const results = await searchUniversities(query, limit);

    return NextResponse.json({ universities: results });
  } catch (error) {
    console.error("Error searching universities:", error);
    return NextResponse.json(
      { error: "Failed to search universities" },
      { status: 500 }
    );
  }
}
