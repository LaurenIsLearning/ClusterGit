import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { authService } from "../services/authService";

const AuthContext = createContext(null);

async function fetchRole(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  // If no row, data will be null. That’s not a crash — role becomes null/unknown.
  if (error) return null;
  return data?.role ?? null;
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
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const session = await authService.getSession();
        const sessionUser = session?.user ?? null;

        if (!alive) return;
        setUser(sessionUser);
        await refreshRole(sessionUser?.id);
      } catch (e) {
        if (!alive) return;
        setAuthError(e?.message ?? "Failed to load session");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const { data: sub } = authService.onAuthStateChange(async (_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      setAuthError(null);
      setLoading(true);
      await refreshRole(sessionUser?.id);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
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

