// Supabase Auth 마이그레이션 후, RLS 클라이언트는 Supabase 자체 JWT를 사용
// getSupabaseAuthClient()가 세션 쿠키에서 JWT를 자동으로 읽어 RLS를 적용
export { getSupabaseAuthClient as getSupabaseRLS } from "@/lib/supabase-auth";
