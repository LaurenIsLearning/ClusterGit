// frontend/src/context/AppContext.jsx
import { createContext, useContext } from "react";
import { useAuth } from "./AuthContext";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Delegate everything to AuthContext
  const { user, login, register, logout, loading: isLoading, authError } = useAuth();

  return (
    <AppContext.Provider value={{ user, login, register, logout, isLoading, authError }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);


