import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function verifyAdminToken(): Promise<{ isAdmin: boolean }> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("admin-session")?.value;

    if (!sessionId) {
      return { isAdmin: false };
    }

    // 세션이 존재하면 어드민으로 인증
    return { isAdmin: true };
  } catch (error) {
    console.error("Admin verification error:", error);
    return { isAdmin: false };
  }
}

export async function requireAdmin(request: NextRequest): Promise<void> {
  const { isAdmin } = await verifyAdminToken();
  
  if (!isAdmin) {
    throw new Error("Admin access required");
  }
}