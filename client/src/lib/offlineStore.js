const DB_NAME = "sadiq_wms_offline";
const DB_VERSION = 1;
const RESPONSE_STORE = "responses";
const QUEUE_STORE = "queue";
const META_STORE = "meta";

const openDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RESPONSE_STORE)) db.createObjectStore(RESPONSE_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const tx = async (store, mode, work) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const objectStore = transaction.objectStore(store);
    let result;
    try { result = work(objectStore); } catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve(result?.result);
    transaction.onerror = () => reject(transaction.error);
  });
};

const requestResult = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const offlineKey = (config) => {
  const params = new URLSearchParams();
  Object.entries(config?.params || {}).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, String(value));
  });
  return `${String(config?.url || "")}?${params.toString()}`;
};

export async function cacheResponse(key, payload) {
  const db = await openDb();
  const transaction = db.transaction(RESPONSE_STORE, "readwrite");
  transaction.objectStore(RESPONSE_STORE).put({ key, payload, savedAt: Date.now() });
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function readCachedResponse(key) {
  const db = await openDb();
  const transaction = db.transaction(RESPONSE_STORE, "readonly");
  return requestResult(transaction.objectStore(RESPONSE_STORE).get(key));
}

export async function enqueueRequest(config) {
  const id = crypto.randomUUID();
  const item = {
    id,
    method: String(config.method || "post").toLowerCase(),
    url: config.url,
    params: config.params || null,
    data: typeof config.data === "string" ? config.data : JSON.stringify(config.data ?? null),
    createdAt: Date.now(),
    attempts: 0,
  };
  const db = await openDb();
  const transaction = db.transaction(QUEUE_STORE, "readwrite");
  transaction.objectStore(QUEUE_STORE).put(item);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  window.dispatchEvent(new CustomEvent("wms-offline-queue-changed"));
  return item;
}

export async function listQueuedRequests() {
  const db = await openDb();
  const transaction = db.transaction(QUEUE_STORE, "readonly");
  return (await requestResult(transaction.objectStore(QUEUE_STORE).getAll())).sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeQueuedRequest(id) {
  const db = await openDb();
  const transaction = db.transaction(QUEUE_STORE, "readwrite");
  transaction.objectStore(QUEUE_STORE).delete(id);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  window.dispatchEvent(new CustomEvent("wms-offline-queue-changed"));
}

export async function updateQueuedRequest(item) {
  const db = await openDb();
  const transaction = db.transaction(QUEUE_STORE, "readwrite");
  transaction.objectStore(QUEUE_STORE).put(item);
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function queuedCount() {
  const db = await openDb();
  const transaction = db.transaction(QUEUE_STORE, "readonly");
  return requestResult(transaction.objectStore(QUEUE_STORE).count());
}

export function isQueueable(config) {
  const method = String(config?.method || "get").toLowerCase();
  const url = String(config?.url || "");
  if (!["post", "put", "patch", "delete"].includes(method)) return false;
  if (/\/auth\/(login|refresh|logout|password)/.test(url)) return false;
  if (/\/uploads\//.test(url)) return false;
  if (/whatsapp|backup|restore/.test(url)) return false;
  return true;
}
