import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";

const AuthContext = createContext(null);

function getRoleFromUser(user) {
  return user?.app_metadata?.role ?? user?.user_metadata?.role ?? null;
}

async function fetchProfileRole() {
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

  async function refreshRole(uid) {
    if (!uid) {
      setRole(null);
      return;
    }

    const session = await authService.getSession();
    const fallbackRole = getRoleFromUser(session?.user);
    const r = (await fetchProfileRole()) ?? fallbackRole;
    setRole(r);
  }

  useEffect(() => {
    let isMounted = true;

    async function bootstrapAuth() {
      setLoading(true);
      try {
        const session = await authService.getSession();
        if (!isMounted) return;

        const sessionUser = session?.user ?? null;
        setUser(sessionUser);

        if (!sessionUser) {
          setRole(null);
          return;
        }

        const fallbackRole = getRoleFromUser(sessionUser);
        setRole(fallbackRole);

        const resolvedRole = (await fetchProfileRole()) ?? fallbackRole;
        if (!isMounted) return;
        setRole(resolvedRole);
      } catch (error) {
        if (!isMounted) return;
        setAuthError(error);
        setUser(null);
        setRole(null);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    bootstrapAuth();

    const { data } = authService.onAuthStateChange(async (_event, session) => {
      const sessionUser = session?.user ?? null;

      if (!isMounted) return;

      setUser(sessionUser);

      if (!sessionUser) {
        setRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const fallbackRole = getRoleFromUser(sessionUser);
      setRole(fallbackRole);

      try {
        const resolvedRole = (await fetchProfileRole()) ?? fallbackRole;
        if (!isMounted) return;
        setRole(resolvedRole);
      } catch (error) {
        if (!isMounted) return;
        setAuthError(error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
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

