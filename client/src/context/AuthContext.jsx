import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, setUnauthorizedHandler, tokenStorage } from '../api/client.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 'loading' while a stored token is being checked against the server
  const [status, setStatus] = useState(tokenStorage.get() ? 'loading' : 'unauthenticated');

  const clearSession = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const startSession = useCallback((nextUser, token) => {
    tokenStorage.set(token);
    setUser(nextUser);
    setStatus('authenticated');
  }, []);

  // Log out automatically if the server rejects the token
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Restore the session on first load
  useEffect(() => {
    if (!tokenStorage.get()) return undefined;

    const controller = new AbortController();
    api
      .get('/api/auth/me', { signal: controller.signal })
      .then(({ user: me }) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.status === 401) {
          tokenStorage.clear();
          try {
            sessionStorage.setItem('joinus_session_expired', '1');
          } catch {
            /* ignore */
          }
        }
        setUser(null);
        setStatus('unauthenticated');
      });

    return () => controller.abort();
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { user: me, token } = await api.post('/api/auth/login', { email, password });
      startSession(me, token);
    },
    [startSession]
  );

  const register = useCallback(
    async (name, email, password) => {
      const { user: me, token } = await api.post('/api/auth/register', { name, email, password });
      startSession(me, token);
    },
    [startSession]
  );

  const updateUser = useCallback((nextUser) => {
    setUser((prev) => (prev ? { ...prev, ...nextUser } : nextUser));
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout: clearSession, updateUser }),
    [user, status, login, register, clearSession, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  return ctx || { user: null, status: 'unauthenticated' };
}
