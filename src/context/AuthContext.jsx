import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('usuario_reparto');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.token) setUsuario(parsed);
    } catch {
      localStorage.removeItem('usuario_reparto');
    }
  }, []);

  const login = (data) => {
    setUsuario(data);
    localStorage.setItem('usuario_reparto', JSON.stringify(data));
  };

  const logout = () => {
    setUsuario(null);
    localStorage.removeItem('usuario_reparto');
    localStorage.removeItem('repartidor_alert_seen');
  };

  const value = useMemo(() => ({ usuario, login, logout }), [usuario]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}