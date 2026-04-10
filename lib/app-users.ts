import { getSupabaseServer } from "@/lib/supabase-server";

export interface UserInfo {
  name: string;
  email: string;
}

/**
 * profiles 테이블에서 유저 정보를 일괄 조회합니다.
 * (Clerk batchGetUserInfo 대체)
 *
 * @param userIds - Supabase UUID 배열
 * @returns userId → { name, email } Map
 */
export async function batchGetUserInfo(
  userIds: string[]
): Promise<Map<string, UserInfo>> {
  const result = new Map<string, UserInfo>();

  if (userIds.length === 0) return result;

  const uniqueIds = [...new Set(userIds)];

  try {
    const supabase = getSupabaseServer();
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", uniqueIds);

    for (const profile of profiles ?? []) {
      result.set(profile.id, {
        name: profile.full_name || `User ${profile.id.slice(0, 8)}`,
        email: profile.email || `${profile.id}@example.com`,
      });
    }

    // 조회 실패한 ID에 fallback
    for (const id of uniqueIds) {
      if (!result.has(id)) {
        result.set(id, {
          name: `User ${id.slice(0, 8)}`,
          email: `${id}@example.com`,
        });
      }
    }
  } catch {
    for (const id of uniqueIds) {
      result.set(id, {
        name: `User ${id.slice(0, 8)}`,
        email: `${id}@example.com`,
      });
    }
  }

  return result;
}
