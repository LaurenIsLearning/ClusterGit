import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";


const AuthContext = createContext(null);

function getRoleFromUser(user) {
  return user?.app_metadata?.role ?? user?.user_metadata?.role ?? null;
}

async function fetchRole(userId) {
  if (!userId) {
    return null;
  }

  try {
    const profile = await authService.getProfile();
    return profile?.role ?? null;
  } catch (error) {
    console.error("[fetchRole] failed:", error);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  async function refreshRole(uid) {
    if (!uid) {
      setRole(null);
      return;
    }

    const session = await authService.getSession();
    const fallbackRole = getRoleFromUser(session?.user);
    const r = await fetchRole(uid);
    setRole(r ?? fallbackRole);
  }

  async function applyResolvedRole(sessionUser) {
    const fallbackRole = getRoleFromUser(sessionUser);
    setRole(fallbackRole);

    if (!sessionUser?.id) {
      return;
    }

    try {
      const resolvedRole = await fetchRole(sessionUser.id);
      setRole(resolvedRole ?? fallbackRole);
    } catch (e) {
      console.error("[AUTH] role fetch failed:", e);
      setRole(fallbackRole);
    }
  }

  useEffect(() => {
    console.log("[AUTH] effect mounted");
    setLoading(true);

    authService.getSession()
      .then(async (session) => {
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);

        if (!sessionUser) {
          setRole(null);
          return;
        }

        await applyResolvedRole(sessionUser);
      })
      .catch((error) => {
        console.error("[AUTH] initial session load failed:", error);
        setAuthError(error);
        setUser(null);
        setRole(null);
      })
      .finally(() => {
        setLoading(false);
      });

    const { data } = authService.onAuthStateChange(async (event, session) => {
      console.log("[AUTH EVENT]", event);

      const sessionUser = session?.user ?? null;

      setUser(sessionUser);

      if (!sessionUser) {
        setRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      await applyResolvedRole(sessionUser);
      setLoading(false);
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

