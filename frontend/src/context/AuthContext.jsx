import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { authService } from "../services/authService";


const AuthContext = createContext(null);

async function fetchRole(userId) {
  console.log("[fetchRole] called with:", userId);

  if (!userId) {
    console.log("[fetchRole] no userId provided");
    return null;
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  console.log("[fetchRole] response:", { data, error });

  if (error) {
    console.error("[fetchRole] ERROR:", error);
    return null;
  }

  if (!data) {
    console.warn("[fetchRole] no row found for user");
    return null;
  }

  console.log("[fetchRole] resolved role:", data.role);
  return data.role ?? null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  async function refreshRole(uid) {
    const r = await fetchRole(uid);
    setRole(r);
  }

  useEffect(() => {
    console.log("[AUTH] effect mounted");
    setLoading(true);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[AUTH EVENT]", event);

      const sessionUser = session?.user ?? null;

      setUser(sessionUser);
      setLoading(false);

      // Clear role if signed out
      if (!sessionUser) {
        setRole(null);
        return;
      }

      console.log("[AUTH] scheduling role fetch (setTimeout 0)");

      setTimeout(async () => {
        console.log("[AUTH] role fetch start (delayed)");
        try {
          const r = await fetchRole(sessionUser.id);
          console.log("[AUTH] role fetch done (delayed):", r);
          setRole(r);
        } catch (e) {
          console.error("[AUTH] role fetch failed (delayed):", e);
          setRole(null);
        }
      }, 0);
    });

    const subscription = data?.subscription;

    return () => {
      console.log("[AUTH] effect cleanup");
      subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      role, // can be null => treat as UNKNOWN in UI
      loading,
      authError,

      signUp: async (email, password) => {
        setAuthError(null);
        const data = await authService.signUp(email, password);
        return data;
      },

      signIn: async (email, password) => {
        setAuthError(null);
        const data = await authService.signIn(email, password);
        return data;
      },

      signInWithGitHub: async (redirectTo) => {
        setAuthError(null);
        return authService.signInWithGitHub(redirectTo);
      },

      signOut: async () => {
        setAuthError(null);
        await authService.signOut();
      },

      refreshRole: async () => refreshRole(user?.id),
    }),
    [user, role, loading, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

