import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { authService } from "../Services/wmsService";

const AuthContext = createContext(null);
const SESSION_KEY = "wms_session";
const PROFILE_KEY = "wms_profile";

function readStored(key) {
  try {
    return JSON.parse(
      localStorage.getItem(key) || sessionStorage.getItem(key) || "null",
    );
  } catch {
    return null;
  }
}

function clearAuth() {
  [localStorage, sessionStorage].forEach((storage) => {
    storage.removeItem(SESSION_KEY);
    storage.removeItem(PROFILE_KEY);
  });
}

function saveAuth(session, profile, remember) {
  clearAuth();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  storage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStored(SESSION_KEY));
  const [profile, setProfile] = useState(() => readStored(PROFILE_KEY));
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (identifier, loginCode, remember = true) => {
    setLoading(true);
    try {
      const result = await authService.login({
        identifier,
        password: loginCode,
      });
      saveAuth(result.session, result.profile, remember);
      setSession(result.session);
      setProfile(result.profile);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (session?.access_token) await authService.logout();
    } catch {
      // Local session is cleared even if API logout fails.
    }
    clearAuth();
    setSession(null);
    setProfile(null);
  }, [session?.access_token]);

  const refreshProfile = useCallback(async () => {
    if (!session?.access_token) return null;
    try {
      const next = await authService.profile();
      const remember = Boolean(localStorage.getItem(SESSION_KEY));
      saveAuth(session, next, remember);
      setProfile(next);
      return next;
    } catch {
      return profile;
    }
  }, [profile, session]);

  const value = useMemo(
    () => ({
      session,
      profile,
      user: profile,
      loading,
      isAuthenticated: Boolean(session?.access_token && profile),
      login,
      logout,
      refreshProfile,
      setProfile,
    }),
    [session, profile, loading, login, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
