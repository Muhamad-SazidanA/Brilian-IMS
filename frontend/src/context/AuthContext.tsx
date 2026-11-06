import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';
import { api, hasPermission as checkRolePermission } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  switchRole: (role: Role) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check saved token on mount
    const savedToken = api.getToken();
    if (savedToken) {
      const currentUser = api.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setToken(savedToken);
      } else {
        api.removeToken();
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.login(username, password);
      setUser(res.user);
      setToken(res.token);
    } catch (err: any) {
      const msg = err.message || 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const switchRole = (role: Role): void => {
    const roleCredentials: Record<Role, { username: string; pass: string }> = {
      admin: { username: 'admin_brilian', pass: 'securepassword' },
      reviewer: { username: 'reviewer_1', pass: 'reviewerpass' },
      uploader: { username: 'uploader_1', pass: 'uploaderpass' },
      viewer: { username: 'viewer_1', pass: 'viewerpass' },
    };

    const cred = roleCredentials[role];
    if (cred) {
      login(cred.username, cred.pass).catch(() => {
        // Fallback quick state swap
        const mockUser: User = {
          id: `usr-${role}-quick`,
          username: cred.username,
          role,
          name: `${role.toUpperCase()} User`,
        };
        setUser(mockUser);
      });
    }
  };

  const logout = (): void => {
    api.removeToken();
    setUser(null);
    setToken(null);
    setError(null);
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return checkRolePermission(user.role, permission);
  };

  const clearError = (): void => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        switchRole,
        logout,
        hasPermission,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
