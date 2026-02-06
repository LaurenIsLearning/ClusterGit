// frontend/src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { authService } from "../services/authService";

const AuthContext = createContext(null);

async function fetchRoleForUser(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (error) return null; // row missing or RLS blocked
  return data?.role ?? null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const syncUserAndRole = async (sessionUser) => {
    setUser(sessionUser ?? null);
    const r = await fetchRoleForUser(sessionUser?.id);
    setRole(r);
  };

  // Initial session restore + listener
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const session = await authService.getSession();
        if (!alive) return;

        const sessionUser = session?.user ?? null;
        await syncUserAndRole(sessionUser);
      } catch (e) {
        if (!alive) return;
        setAuthError(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const { data: sub } = authService.onAuthStateChange(async (_event, session) => {
      setLoading(true);
      setAuthError(null);
      await syncUserAndRole(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // Auth actions
  const register = async (email, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      const data = await authService.register(email, password);
      // Supabase may require email confirmation; session might be null
      const sessionUser = data?.user ?? null;
      await syncUserAndRole(sessionUser);
      return { success: true, data };
    } catch (e) {
      setAuthError(e?.message ?? String(e));
      return { success: false, error: e?.message ?? String(e) };
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      const data = await authService.login(email, password);
      const sessionUser = data?.user ?? null;
      await syncUserAndRole(sessionUser);
      return { success: true, data };
    } catch (e) {
      setAuthError(e?.message ?? String(e));
      return { success: false, error: e?.message ?? String(e) };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      await authService.logout();
      setUser(null);
      setRole(null);
      return { success: true };
    } catch (e) {
      setAuthError(e?.message ?? String(e));
      return { success: false, error: e?.message ?? String(e) };
    } finally {
      setLoading(false);
    }
  };

  const value = useMemo(
    () => ({
      user,
      role,
      loading,
      authError,
      register,
      login,
      logout,
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
