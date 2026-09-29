import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

const readSession = () => {
  const raw = localStorage.getItem("wms_session") || sessionStorage.getItem("wms_session");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem("wms_session");
    sessionStorage.removeItem("wms_session");
    return null;
  }
};

const writeSession = (session) => {
  const storage = localStorage.getItem("wms_session") ? localStorage : sessionStorage;
  storage.setItem("wms_session", JSON.stringify(session));
};

const clearAuth = () => {
  localStorage.removeItem("wms_session");
  localStorage.removeItem("wms_profile");
  sessionStorage.removeItem("wms_session");
  sessionStorage.removeItem("wms_profile");
};

api.interceptors.request.use((config) => {
  const session = readSession();
  if (session?.access_token) config.headers.Authorization = `Bearer ${session.access_token}`;
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = String(original?.url || "").includes("/auth/login") || String(original?.url || "").includes("/auth/refresh");
    const session = readSession();

    if (error.response?.status === 401 && !original?._retried && !isAuthEndpoint && session?.refresh_token) {
      original._retried = true;
      try {
        refreshPromise ||= axios.post(`${apiBaseUrl}/auth/refresh`, { refresh_token: session.refresh_token }, { timeout: 20000 });
        const refreshResponse = await refreshPromise;
        const nextSession = refreshResponse.data.data.session;
        writeSession(nextSession);
        original.headers.Authorization = `Bearer ${nextSession.access_token}`;
        return api(original);
      } catch {
        clearAuth();
      } finally {
        refreshPromise = null;
      }
    }

    if (error.response?.status === 401 && !isAuthEndpoint) {
      clearAuth();
      if (!["/login", "/reset-password"].includes(window.location.pathname)) window.location.assign("/login");
    }
    return Promise.reject(error);
  },
);

export const getErrorMessage = (error, fallback = "عملیات بشپړ نه شول.") =>
  error?.response?.data?.message || error?.message || fallback;

export default api;
