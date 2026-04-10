/**
 * Clerk → Supabase Auth 유저 마이그레이션 스크립트
 *
 * 사용법:
 *   npx tsx scripts/migrate-clerk-users.ts
 *
 * 필요 환경변수 (.env.local):
 *   CLERK_SECRET_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 순서:
 *   1. Clerk에서 전체 유저 목록 조회 (clerk_id + email + name + role)
 *   2. Supabase Auth에서 이메일로 매칭 or 신규 유저 생성
 *   3. profiles 테이블에 정보 업데이트
 *   4. 기존 테이블의 Clerk ID → Supabase UUID로 일괄 UPDATE
 *   5. 검증
 */

import { createClient } from "@supabase/supabase-js";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!CLERK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface ClerkUser {
  id: string;
  email_addresses: Array<{ email_address: string; id: string }>;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  unsafe_metadata: {
    role?: string;
    status?: string;
  };
}

// ─── Step 1: Clerk 유저 조회 ───

async function fetchClerkUsers(): Promise<ClerkUser[]> {
  const allUsers: ClerkUser[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(
      `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } }
    );

    if (!res.ok) {
      throw new Error(`Clerk API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    allUsers.push(...data);

    if (data.length < limit) break;
    offset += limit;
  }

  return allUsers;
}

// ─── Main ───

async function main() {
  console.log("=== Clerk → Supabase Auth Migration ===\n");

  // Step 1: Clerk 유저 조회
  console.log("1. Fetching Clerk users...");
  const clerkUsers = await fetchClerkUsers();
  console.log(`   Found ${clerkUsers.length} users\n`);

  // Supabase Auth 유저 목록 한 번에 가져오기
  const { data: authListData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUsers = authListData?.users ?? [];
  const emailToAuthId = new Map(authUsers.map((u) => [u.email, u.id]));

  // Step 2: 매칭/생성
  console.log("2. Matching/creating Supabase Auth users...");

  const mappings: Array<{ clerkId: string; supabaseId: string; clerkUser: ClerkUser }> = [];
  const results = { matched: 0, created: 0, failed: 0 };

  for (const clerkUser of clerkUsers) {
    const email = clerkUser.email_addresses[0]?.email_address;
    if (!email) {
      console.log(`   ${clerkUser.id}: no email, skipping`);
      results.failed++;
      continue;
    }

    process.stdout.write(`   ${email}... `);

    const existingId = emailToAuthId.get(email);
    if (existingId) {
      console.log(`✓ matched (${existingId})`);
      mappings.push({ clerkId: clerkUser.id, supabaseId: existingId, clerkUser });
      results.matched++;
    } else {
      // Supabase Auth에 없으면 생성
      const fullName = [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ") || null;
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          avatar_url: clerkUser.image_url,
        },
      });

      if (authError) {
        console.log(`✗ ${authError.message}`);
        results.failed++;
      } else {
        console.log(`+ created (${authData.user.id})`);
        mappings.push({ clerkId: clerkUser.id, supabaseId: authData.user.id, clerkUser });
        emailToAuthId.set(email, authData.user.id);
        results.created++;
      }
    }
  }

  console.log(`\n   Results: ${results.matched} matched, ${results.created} created, ${results.failed} failed`);

  // Step 3: profiles 업데이트
  console.log("\n3. Updating profiles...");
  for (const { supabaseId, clerkUser } of mappings) {
    const fullName = [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ") || "User";
    const role = clerkUser.unsafe_metadata?.role ?? "student";
    const status = clerkUser.unsafe_metadata?.status ?? "approved";

    await supabase
      .from("profiles")
      .upsert(
        {
          id: supabaseId,
          display_name: fullName,
          avatar_url: clerkUser.image_url,
          role,
          status,
        },
        { onConflict: "id" }
      );
  }
  console.log(`   ${mappings.length} profiles updated`);

  // Step 4: FK re-keying
  console.log("\n4. Updating foreign keys...");

  for (const { clerkId, supabaseId } of mappings) {
    // sessions.student_id
    const r1 = await supabase.from("sessions").update({ student_id: supabaseId }).eq("student_id", clerkId);
    if (r1.count) console.log(`   sessions: ${r1.count} rows for ${clerkId}`);

    // exams.instructor_id
    const r2 = await supabase.from("exams").update({ instructor_id: supabaseId }).eq("instructor_id", clerkId);
    if (r2.count) console.log(`   exams: ${r2.count} rows for ${clerkId}`);

    // exam_nodes.instructor_id
    const r3 = await supabase.from("exam_nodes").update({ instructor_id: supabaseId }).eq("instructor_id", clerkId);
    if (r3.count) console.log(`   exam_nodes: ${r3.count} rows for ${clerkId}`);

    // ai_events.user_id
    const r4 = await supabase.from("ai_events").update({ user_id: supabaseId }).eq("user_id", clerkId);
    if (r4.count) console.log(`   ai_events: ${r4.count} rows for ${clerkId}`);

    // student_profiles.student_id
    const r5 = await supabase.from("student_profiles").update({ student_id: supabaseId }).eq("student_id", clerkId);
    if (r5.count) console.log(`   student_profiles: ${r5.count} rows for ${clerkId}`);

    // instructor_profiles.id — PK이므로 delete + insert
    const { data: instrProfile } = await supabase
      .from("instructor_profiles")
      .select("*")
      .eq("id", clerkId)
      .single();

    if (instrProfile) {
      await supabase.from("instructor_profiles").delete().eq("id", clerkId);
      await supabase.from("instructor_profiles").insert({
        ...instrProfile,
        id: supabaseId,
      });
      console.log(`   instructor_profiles: re-keyed ${clerkId}`);
    }
  }

  // Step 5: 검증
  console.log("\n5. Verification...");
  const { count: clerkSessions } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .like("student_id", "user_%");
  console.log(`   sessions with Clerk IDs remaining: ${clerkSessions ?? 0}`);

  const { count: clerkExams } = await supabase
    .from("exams")
    .select("*", { count: "exact", head: true })
    .like("instructor_id", "user_%");
  console.log(`   exams with Clerk IDs remaining: ${clerkExams ?? 0}`);

  const { count: clerkStudentProfiles } = await supabase
    .from("student_profiles")
    .select("*", { count: "exact", head: true })
    .like("student_id", "user_%");
  console.log(`   student_profiles with Clerk IDs remaining: ${clerkStudentProfiles ?? 0}`);

  const { count: clerkInstructorProfiles } = await supabase
    .from("instructor_profiles")
    .select("*", { count: "exact", head: true })
    .like("id", "user_%");
  console.log(`   instructor_profiles with Clerk IDs remaining: ${clerkInstructorProfiles ?? 0}`);

  console.log("\n=== Migration complete ===");
  console.log("\nClerk ID가 0개 남았으면 성공!");
  console.log("남은 게 있으면 해당 Clerk 유저가 Supabase에 매칭되지 않은 것 — 수동 확인 필요.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
