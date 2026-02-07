import { createContext, useContext } from "react";
import { useAuth } from "./AuthContext";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const auth = useAuth();

  const value = {
    user: auth.user,
    isLoading: auth.loading,
    authError: auth.authError,

    // Keep old names so existing code doesn’t explode
    login: async (email, password) => {
      try {
        await auth.signIn(email, password);
        return { success: true };
      } catch (e) {
        return { success: false, error: e?.message ?? "Login failed" };
      }
    },

    register: async (email, password) => {
      try {
        await auth.signUp(email, password);
        return { success: true };
      } catch (e) {
        return { success: false, error: e?.message ?? "Register failed" };
      }
    },

    logout: async () => auth.signOut(),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);



