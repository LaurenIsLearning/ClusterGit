import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

const AppContext = createContext();

export function AppProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState(null);

    const register = async (email, password) => {
        setIsLoading(true);
        setAuthError(null);
        try {
            const data = await authService.register(email, password);
            setUser(data.user);
            return { success: true, data };
        } catch (error) {
            setAuthError(error.message);
            return { success: false, error: error.message };
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (email, password) => {
        setIsLoading(true);
        setAuthError(null);
        try {
            const data = await authService.login(email, password);
            setUser(data.user);
            return { success: true, data };
        } catch (error) {
            setAuthError(error.message);
            return { success: false, error: error.message };
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        try {
            await authService.logout();
            setUser(null);
            localStorage.removeItem('clustergit_user');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    // Initialize auth state
    useEffect(() => {
        const initAuth = async () => {
            try {
                const session = await authService.getSession();
                if (session?.user) {
                    setUser(session.user);
                }
            } catch (error) {
                console.error('Session restore error:', error);
            } finally {
                setIsLoading(false);
            }
        };

        initAuth();

        // Listen for auth state changes
        const { data: { subscription } } = authService.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                setUser(session?.user || null);
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
            }
        });

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    return (
        <AppContext.Provider value={{ user, login, register, logout, isLoading, authError }}>
            {children}
        </AppContext.Provider>
    );
}

export const useApp = () => useContext(AppContext);

