import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiClient } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("zf_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("zf_token");
    if (!token) { setLoading(false); return; }
    try {
      const r = await apiClient.get("/auth/me");
      setUser(r.data);
      localStorage.setItem("zf_user", JSON.stringify(r.data));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const r = await apiClient.post("/auth/login", { email, password });
    localStorage.setItem("zf_token", r.data.access_token);
    localStorage.setItem("zf_user", JSON.stringify(r.data.user));
    setUser(r.data.user);
    return r.data.user;
  };

  const register = async (name, email, password) => {
    const r = await apiClient.post("/auth/register", { name, email, password });
    localStorage.setItem("zf_token", r.data.access_token);
    localStorage.setItem("zf_user", JSON.stringify(r.data.user));
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = () => {
    localStorage.removeItem("zf_token");
    localStorage.removeItem("zf_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
