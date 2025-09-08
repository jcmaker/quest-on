import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || "admin-secret-key"
);

export async function verifyAdminToken(request?: NextRequest) {
  try {
    let token: string | undefined;

    if (request) {
      // API 라우트에서 사용
      token = request.cookies.get("admin-token")?.value;
    } else {
      // 서버 컴포넌트에서 사용
      const cookieStore = await cookies();
      token = cookieStore.get("admin-token")?.value;
    }

    if (!token) {
      return { isAdmin: false, error: "No token found" };
    }

    const { payload } = await jwtVerify(token, secret);

    if (payload.role === "admin") {
      return { isAdmin: true };
    } else {
      return { isAdmin: false, error: "Invalid token" };
    }
  } catch (error) {
    console.error("Admin token verification error:", error);
    return { isAdmin: false, error: "Token verification failed" };
  }
}

export async function requireAdmin(request?: NextRequest) {
  const { isAdmin, error } = await verifyAdminToken(request);

  if (!isAdmin) {
    throw new Error(error || "Admin access required");
  }

  return true;
}
