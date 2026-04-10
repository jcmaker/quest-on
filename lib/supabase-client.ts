import { createBrowserClient } from "@supabase/ssr";

// 클라이언트 사이드에서 사용할 Supabase 클라이언트 (Auth + Realtime 구독용)
export function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
