import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { authService } from "../services/authService";


const AuthContext = createContext(null);

async function fetchRole(userId) {
  if (!userId) return null;

  try {
    const profile = await authService.getProfile();
    if (profile?.role) return profile.role;
  } catch (error) {
    console.warn("[fetchRole] backend profile lookup failed, falling back to direct profile read:", error);
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[fetchRole] ERROR:", error);
    return null;
  }

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
    let isMounted = true;

    // Seed state once from the current session so we don't depend solely on auth events.
    (async () => {
      try {
        const session = await authService.getSession();
        if (!isMounted) return;
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        if (sessionUser) {
          const r = await fetchRole(sessionUser.id);
          if (isMounted) setRole(r);
        }
      } catch (e) {
        console.error("[AUTH] initial session load failed:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Ignore events that fire on tab focus or background refresh. These do not
      // represent an actual auth state change and cause cascading re-renders
      // (and sometimes a brief null-user window) if we react to them.
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        return;
      }

      const sessionUser = session?.user ?? null;

      // Only update user state if the identity actually changed. Comparing ids
      // prevents a new object reference from invalidating every consumer's memo.
      setUser((prev) => {
        if (prev?.id === sessionUser?.id) return prev;
        return sessionUser;
      });

      if (!sessionUser) {
        setRole(null);
        return;
      }

      // Only relevant auth events here are SIGNED_IN / SIGNED_OUT / PASSWORD_RECOVERY.
      // A fresh role fetch is appropriate on a real sign-in.
      setTimeout(async () => {
        try {
          const r = await fetchRole(sessionUser.id);
          if (isMounted) setRole(r);
        } catch (e) {
          console.error("[AUTH] role fetch failed:", e);
          if (isMounted) setRole(null);
        }
      }, 0);
    });

    const subscription = data?.subscription;

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      role,
      loading,
      authError,

      signUp: async (email, password) => {
        setAuthError(null);
        const data = await authService.signUp(email, password);
        const sessionUser = data?.session?.user ?? data?.user ?? null;
        if (sessionUser) {
          setUser(sessionUser);
          const r = await fetchRole(sessionUser.id);
          setRole(r || "student");
        }
        return data;
      },

      signIn: async (email, password) => {
        setAuthError(null);
        const data = await authService.signIn(email, password);
        const sessionUser = data?.session?.user ?? data?.user ?? null;
        if (sessionUser) {
          setUser(sessionUser);
          const r = await fetchRole(sessionUser.id);
          setRole(r || "student");
        }
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
