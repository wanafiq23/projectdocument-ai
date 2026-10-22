import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, api, errorMessage } from '../../lib/api';

export interface User { id: string; name: string; email: string }

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  connectionError: string;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await api<User>('/auth/me'));
      setConnectionError('');
    } catch (error) {
      setUser(null);
      setConnectionError(error instanceof ApiError && error.status === 401 ? '' : errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const expire = () => {
      setUser(null);
      setConnectionError('Your session has expired. Please log in again.');
    };
    window.addEventListener('projectdocumentai:session-expired', expire);
    return () => window.removeEventListener('projectdocumentai:session-expired', expire);
  }, []);

  const login = async (email: string, password: string) => {
    const account = await api<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setConnectionError('');
    setUser(account);
  };

  const register = async (name: string, email: string, password: string) => {
    const account = await api<User>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    setConnectionError('');
    setUser(account);
  };

  const logout = async () => {
    await api<void>('/auth/logout', { method: 'POST' });
    setUser(null);
    setConnectionError('');
  };

  return <AuthContext.Provider value={{
    user,
    loading,
    connectionError,
    refresh,
    login,
    register,
    logout,
    updateUser: setUser,
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
