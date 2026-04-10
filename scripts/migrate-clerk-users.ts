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
 *   1. Clerk에서 전체 유저 목록 조회
 *   2. 각 유저를 Supabase Auth에 생성 (email_confirm: true)
 *   3. profiles 테이블에 clerk_id 매핑 저장
 *   4. Magic Link 발송 (유저가 비밀번호 재설정 가능)
 *   5. FK re-keying SQL 출력
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

async function fetchClerkUsers(): Promise<ClerkUser[]> {
  const allUsers: ClerkUser[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(
      `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${CLERK_SECRET_KEY}`,
        },
      }
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

async function migrateUser(clerkUser: ClerkUser): Promise<{
  clerkId: string;
  supabaseId: string | null;
  status: "created" | "skipped" | "error";
  error?: string;
}> {
  const email = clerkUser.email_addresses[0]?.email_address;
  if (!email) {
    return { clerkId: clerkUser.id, supabaseId: null, status: "skipped", error: "No email" };
  }

  const role = clerkUser.unsafe_metadata?.role ?? "student";
  const status = clerkUser.unsafe_metadata?.status ?? "approved";
  const fullName = [clerkUser.first_name, clerkUser.last_name]
    .filter(Boolean)
    .join(" ") || null;

  // 이미 마이그레이션된 유저 확인
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_id", clerkUser.id)
    .single();

  if (existing) {
    return { clerkId: clerkUser.id, supabaseId: existing.id, status: "skipped" };
  }

  // Supabase Auth에 유저 생성
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      avatar_url: clerkUser.image_url,
      role,
    },
  });

  if (authError) {
    // 이미 존재하는 이메일은 조회
    if (authError.message.includes("already registered")) {
      const { data: existingByEmail } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();
      if (existingByEmail) {
        // clerk_id 연결
        await supabase
          .from("profiles")
          .update({ clerk_id: clerkUser.id })
          .eq("id", existingByEmail.id);
        return { clerkId: clerkUser.id, supabaseId: existingByEmail.id, status: "skipped" };
      }
    }
    return { clerkId: clerkUser.id, supabaseId: null, status: "error", error: authError.message };
  }

  const supabaseId = authData.user.id;

  // profiles 테이블 업데이트 (trigger가 이미 만든 경우 upsert)
  await supabase
    .from("profiles")
    .upsert(
      {
        id: supabaseId,
        clerk_id: clerkUser.id,
        email,
        full_name: fullName,
        avatar_url: clerkUser.image_url,
        role,
        status,
      },
      { onConflict: "id" }
    );

  return { clerkId: clerkUser.id, supabaseId, status: "created" };
}

async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) {
    console.warn(`  Magic link failed for ${email}: ${error.message}`);
  }
}

async function main() {
  console.log("=== Clerk → Supabase Auth Migration ===\n");

  console.log("1. Fetching Clerk users...");
  const clerkUsers = await fetchClerkUsers();
  console.log(`   Found ${clerkUsers.length} users\n`);

  const results = {
    created: 0,
    skipped: 0,
    errors: 0,
    mapping: [] as Array<{ clerkId: string; supabaseId: string }>,
  };

  console.log("2. Migrating users to Supabase...");
  for (const user of clerkUsers) {
    const email = user.email_addresses[0]?.email_address ?? "(no email)";
    process.stdout.write(`   ${email}... `);

    const result = await migrateUser(user);

    if (result.status === "created") {
      console.log(`✓ created (${result.supabaseId})`);
      results.created++;
      results.mapping.push({ clerkId: result.clerkId, supabaseId: result.supabaseId! });
    } else if (result.status === "skipped") {
      console.log(`- skipped`);
      results.skipped++;
      if (result.supabaseId) {
        results.mapping.push({ clerkId: result.clerkId, supabaseId: result.supabaseId });
      }
    } else {
      console.log(`✗ error: ${result.error}`);
      results.errors++;
    }
  }

  console.log(`\n   Results: ${results.created} created, ${results.skipped} skipped, ${results.errors} errors`);

  if (results.created > 0) {
    console.log("\n3. Sending Magic Link emails to new users...");
    for (const user of clerkUsers) {
      const email = user.email_addresses[0]?.email_address;
      if (email && results.mapping.some((m) => m.clerkId === user.id)) {
        await sendMagicLink(email);
        console.log(`   Sent magic link to ${email}`);
      }
    }
  }

  console.log("\n4. FK Re-keying SQL (run this AFTER migration verification):");
  console.log(`
-- =============================================================================
-- Run this SQL in Supabase SQL Editor AFTER verifying migration is complete
-- =============================================================================

-- Populate supabase UUIDs in FK columns
UPDATE public.sessions s
  SET supabase_student_id = p.id
  FROM public.profiles p
  WHERE s.student_id = p.clerk_id AND p.clerk_id IS NOT NULL;

UPDATE public.exams e
  SET supabase_instructor_id = p.id
  FROM public.profiles p
  WHERE e.instructor_id = p.clerk_id AND p.clerk_id IS NOT NULL;

UPDATE public.exam_nodes en
  SET supabase_instructor_id = p.id
  FROM public.profiles p
  WHERE en.instructor_id = p.clerk_id AND p.clerk_id IS NOT NULL;

UPDATE public.ai_events ae
  SET supabase_user_id = p.id
  FROM public.profiles p
  WHERE ae.user_id = p.clerk_id AND p.clerk_id IS NOT NULL;

UPDATE public.student_profiles sp
  SET supabase_student_id = p.id
  FROM public.profiles p
  WHERE sp.student_id = p.clerk_id AND p.clerk_id IS NOT NULL;

UPDATE public.instructor_profiles ip
  SET supabase_id = p.id
  FROM public.profiles p
  WHERE ip.id = p.clerk_id AND p.clerk_id IS NOT NULL;

-- Verification (should all return 0)
SELECT 'sessions missing' AS check, COUNT(*) FROM sessions WHERE supabase_student_id IS NULL AND student_id LIKE 'user_%';
SELECT 'exams missing' AS check, COUNT(*) FROM exams WHERE supabase_instructor_id IS NULL AND instructor_id LIKE 'user_%';
`);

  console.log("\n=== Migration complete ===");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
