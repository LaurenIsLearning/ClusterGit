import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";

const AuthContext = createContext(null);

async function fetchRole() {
  try {
    const profile = await authService.getProfile();
    return profile?.role ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  async function refreshRole() {
    const r = await fetchRole();
    setRole(r);
  }

  useEffect(() => {
    setLoading(true);

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;

      setUser(sessionUser);
      setLoading(false);

      if (!sessionUser) {
        setRole(null);
        return;
      }

      setTimeout(async () => {
        const r = await fetchRole();
        setRole(r);
      }, 0);
    });

    const subscription = data?.subscription;

    return () => {
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

      refreshRole: async () => refreshRole(),
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

