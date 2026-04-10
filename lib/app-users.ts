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
      .select("id, display_name")
      .in("id", uniqueIds);

    // auth.users에서 email 가져오기
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map(authData?.users?.map((u) => [u.id, u.email ?? ""]) ?? []);

    for (const profile of profiles ?? []) {
      result.set(profile.id, {
        name: profile.display_name || `User ${profile.id.slice(0, 8)}`,
        email: emailMap.get(profile.id) || `${profile.id}@example.com`,
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
