"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { createSupabaseClient } from "@/lib/supabase-client";
import type { User } from "@supabase/supabase-js";

export type AppProfile = {
  role: "instructor" | "student";
  status: "pending" | "approved";
  fullName: string | null;
  avatarUrl: string | null;
  email: string;
};

type AppAuthState = {
  user: User | null;
  profile: AppProfile | null;
  isLoaded: boolean;
  isSignedIn: boolean;
};

const AuthContext = createContext<AppAuthState>({
  user: null,
  profile: null,
  isLoaded: false,
  isSignedIn: false,
});

export function AppAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppAuthState>({
    user: null,
    profile: null,
    isLoaded: false,
    isSignedIn: false,
  });

  const loadProfile = useCallback(async (user: User) => {
    const supabase = createSupabaseClient();
    const { data } = await supabase
      .from("profiles")
      .select("role, status, full_name, avatar_url, email")
      .eq("id", user.id)
      .single();

    setState({
      user,
      profile: data
        ? {
            role: data.role as AppProfile["role"],
            status: data.status as AppProfile["status"],
            fullName: data.full_name ?? null,
            avatarUrl: data.avatar_url ?? null,
            email: data.email ?? user.email ?? "",
          }
        : null,
      isLoaded: true,
      isSignedIn: true,
    });
  }, []);

  useEffect(() => {
    const supabase = createSupabaseClient();

    // 초기 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setState({ user: null, profile: null, isLoaded: true, isSignedIn: false });
      }
    });

    // 인증 상태 변경 구독
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setState({ user: null, profile: null, isLoaded: true, isSignedIn: false });
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  return (
    <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
  );
}

export function useAppUser() {
  return useContext(AuthContext);
}
