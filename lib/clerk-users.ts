import { createClerkClient } from "@clerk/nextjs/server";

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export interface ClerkUserInfo {
  name: string;
  email: string;
}

/**
 * Clerk 사용자 정보를 일괄 조회합니다.
 * 개별 getUser() 호출 대신 getUserList()를 사용하여 N+1 문제를 해결합니다.
 *
 * @param userIds - Clerk user ID 배열
 * @returns userId → { name, email } Map
 */
export async function batchGetUserInfo(
  userIds: string[]
): Promise<Map<string, ClerkUserInfo>> {
  const result = new Map<string, ClerkUserInfo>();

  if (userIds.length === 0) return result;

  // 중복 제거
  const uniqueIds = [...new Set(userIds)];

  try {
    // Clerk getUserList는 한 번에 최대 500명까지 조회 가능
    // 대부분의 시험은 500명 미만이므로 단일 호출로 충분
    const { data: users } = await clerk.users.getUserList({
      userId: uniqueIds,
      limit: 500,
    });

    for (const user of users) {
      let name = "";
      if (user.firstName && user.lastName) {
        name = `${user.firstName} ${user.lastName}`;
      } else if (user.firstName) {
        name = user.firstName;
      } else if (user.lastName) {
        name = user.lastName;
      } else if (user.fullName) {
        name = user.fullName;
      } else {
        name =
          user.emailAddresses[0]?.emailAddress ||
          `Student ${user.id.slice(0, 8)}`;
      }

      const email =
        user.emailAddresses[0]?.emailAddress || `${user.id}@example.com`;

      result.set(user.id, { name, email });
    }

    // 조회 실패한 ID에 대해 fallback 설정
    for (const id of uniqueIds) {
      if (!result.has(id)) {
        result.set(id, {
          name: `Student ${id.slice(0, 8)}`,
          email: `${id}@example.com`,
        });
      }
    }
  } catch (error) {
    console.error("[clerk-users] Batch user fetch failed:", error);
    // 전체 실패 시 모든 ID에 fallback 설정
    for (const id of uniqueIds) {
      result.set(id, {
        name: `Student ${id.slice(0, 8)}`,
        email: `${id}@example.com`,
      });
    }
  }

  return result;
}
