import axios from "axios";
import { cacheResponse, enqueueRequest, isQueueable, listQueuedRequests, offlineKey, readCachedResponse, removeQueuedRequest, updateQueuedRequest } from "./offlineStore";

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
  const url = String(config?.url || "");
  const isAuthEndpoint = url.includes("/auth/login") || url.includes("/auth/refresh");
  if (!navigator.onLine && !isAuthEndpoint && !config?._syncReplay) {
    return Promise.reject({ config, message: "OFFLINE", isOffline: true });
  }
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => {
    if (String(response.config?.method || "get").toLowerCase() === "get" && response.config?.url) {
      cacheResponse(offlineKey(response.config), response.data).catch(() => {});
    }
    return response;
  },
  async (error) => {
    const original = error.config;
    const networkFailure = !error.response && original;
    if (networkFailure && String(original?.method || "get").toLowerCase() === "get") {
      const cached = await readCachedResponse(offlineKey(original)).catch(() => null);
      if (cached) {
        return { data: cached.payload, status: 200, statusText: "OFFLINE CACHE", headers: {}, config: original, offline: true };
      }
    }
    if (networkFailure && isQueueable(original) && !original?._syncReplay) {
      const queued = await enqueueRequest(original);
      return {
        data: { success: true, data: { offline: true, queued: true, client_operation_id: queued.id } },
        status: 202,
        statusText: "QUEUED OFFLINE",
        headers: {},
        config: original,
        offline: true,
      };
    }
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


let syncRunning = false;

export async function syncOfflineQueue() {
  if (syncRunning || !navigator.onLine) return { synced: 0, pending: 0 };
  syncRunning = true;
  window.dispatchEvent(new CustomEvent("wms-sync-state", { detail: { syncing: true } }));
  let synced = 0;
  try {
    const items = await listQueuedRequests();
    for (const item of items) {
      if (!navigator.onLine) break;
      try {
        await api({
          method: item.method,
          url: item.url,
          params: item.params || undefined,
          data: item.data ? JSON.parse(item.data) : undefined,
          _syncReplay: true,
        });
        await removeQueuedRequest(item.id);
        synced += 1;
      } catch (error) {
        if (!error.response) break;
        await updateQueuedRequest({ ...item, attempts: (item.attempts || 0) + 1, lastError: getErrorMessage(error), lastAttemptAt: Date.now() });
        // A server validation/conflict error needs user attention; do not replay later operations out of order.
        break;
      }
    }
    const pending = (await listQueuedRequests()).length;
    window.dispatchEvent(new CustomEvent("wms-sync-state", { detail: { syncing: false, synced, pending } }));
    return { synced, pending };
  } finally {
    syncRunning = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { syncOfflineQueue().catch(() => {}); });
  window.setTimeout(() => { if (navigator.onLine) syncOfflineQueue().catch(() => {}); }, 1200);
}
