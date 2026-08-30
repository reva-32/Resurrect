import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as api from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem("rra_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { user } = await api.getMe();
      setUser(user);
    } catch {
      localStorage.removeItem("rra_token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  async function doLogin(email, password) {
    const { token, user } = await api.login({ email, password });
    localStorage.setItem("rra_token", token);
    setUser(user);
  }

  async function doSignup(payload) {
    const { token, user } = await api.signup(payload);
    localStorage.setItem("rra_token", token);
    setUser(user);
  }

  function doLogout() {
    localStorage.removeItem("rra_token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login: doLogin, signup: doSignup, logout: doLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
