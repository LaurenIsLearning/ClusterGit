import { createContext, useContext, useState, useEffect } from 'react';
import { mockService } from '../services/mockData';

const AppContext = createContext();

export function AppProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const login = async (role) => {
        setIsLoading(true);
        try {
            const userData = await mockService.login(role);
            setUser(userData);
            localStorage.setItem('clustergit_user', JSON.stringify(userData));
        } finally {
            setIsLoading(false);
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('clustergit_user');
    };

    // Restore session
    useEffect(() => {
        const saved = localStorage.getItem('clustergit_user');
        if (saved) {
            setUser(JSON.parse(saved));
        }
    }, []);

    return (
        <AppContext.Provider value={{ user, login, logout, isLoading }}>
            {children}
        </AppContext.Provider>
    );
}

export const useApp = () => useContext(AppContext);
