import { NextRequest, NextResponse } from "next/server";
import { searchUniversities } from "@/lib/seoul-universities";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "10", 10);

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

