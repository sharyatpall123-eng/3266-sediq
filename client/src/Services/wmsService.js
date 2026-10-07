import api from "../lib/api";

const dataOf = (response) => response?.data?.data;
const metaOf = (response) => response?.data?.meta || {};

const resultOf = (response) => ({
  data: dataOf(response) || [],
  meta: metaOf(response),
});

const FAST_READ_TTL_MS = 30_000;
const fastReadCache = new Map();
const fastReadPending = new Map();

const stableParams = (params = {}) =>
  JSON.stringify(Object.keys(params).sort().reduce((out, key) => {
    const value = params[key];
    if (value !== undefined && value !== null && typeof value !== "object" && value !== "") out[key] = value;
    return out;
  }, {}));

const cachedRead = (key, loader, options = {}) => {
  const { force = false, ttl = FAST_READ_TTL_MS } = options;
  const cached = fastReadCache.get(key);
  if (!force && cached && Date.now() - cached.savedAt < ttl) return Promise.resolve(cached.value);
  if (!force && fastReadPending.has(key)) return fastReadPending.get(key);

  const promise = Promise.resolve().then(loader).then((value) => {
    fastReadCache.set(key, { value, savedAt: Date.now() });
    return value;
  }).finally(() => fastReadPending.delete(key));

  fastReadPending.set(key, promise);
  return promise;
};

const peekRead = (key) => fastReadCache.get(key)?.value || null;

const invalidateRead = (prefix = "") => {
  for (const key of fastReadCache.keys()) if (!prefix || key.startsWith(prefix)) fastReadCache.delete(key);
  for (const key of fastReadPending.keys()) if (!prefix || key.startsWith(prefix)) fastReadPending.delete(key);
};

const uploadFile = async (url, file) => {
  const form = new FormData();

  form.append("file", file);

  const response = await api.post(url, form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return dataOf(response);
};

// ==========================================
// DASHBOARD
// ==========================================

export const dashboardService = {
  get: (options = {}) =>
    cachedRead("dashboard", async () => dataOf(await api.get("/dashboard")), options),
  prefetch: () =>
    cachedRead("dashboard", async () => dataOf(await api.get("/dashboard"))).catch(() => null),
  peek: () => peekRead("dashboard"),
};

// ==========================================
// PRODUCTS
// ==========================================

export const productService = {
  list: (params = {}, options = {}) =>
    cachedRead(
      `products:list:${stableParams(params)}`,
      async () => resultOf(await api.get("/products", { params })),
      options,
    ),

  peekList: (params = {}) =>
    peekRead(`products:list:${stableParams(params)}`),

  prefetchList: (params = {}) =>
    productService.list(params).catch(() => null),

  get: (id, options = {}) =>
    cachedRead(
      `products:get:${id}`,
      async () => dataOf(await api.get(`/products/${id}`)),
      options,
    ),

  peek: (id) =>
    peekRead(`products:get:${id}`),

  prefetch: (id) =>
    productService.get(id).catch(() => null),

  create: async (payload) => {
    const data = dataOf(await api.post("/products", payload));
    invalidateRead("products:");
    invalidateRead("dashboard");
    return data;
  },

  update: async (id, payload) => {
    const data = dataOf(await api.put(`/products/${id}`, payload));
    invalidateRead("products:");
    invalidateRead("stock:");
    invalidateRead("dashboard");
    return data;
  },

  remove: async (id) => {
    const data = dataOf(await api.delete(`/products/${id}`));
    invalidateRead("products:");
    invalidateRead("stock:");
    invalidateRead("dashboard");
    return data;
  },

  uploadImage: async (file) =>
    uploadFile("/uploads/product", file),
};

// ==========================================
// STOCK
// ==========================================

export const stockService = {
  moveIn: async (payload) => {
    const data = dataOf(await api.post("/stock/move-in", payload));
    invalidateRead("stock:");
    invalidateRead("products:");
    invalidateRead("dashboard");
    return data;
  },

  moveOut: async (payload) => {
    const data = dataOf(await api.post("/stock/move-out", payload));
    invalidateRead("stock:");
    invalidateRead("products:");
    invalidateRead("dashboard");
    return data;
  },

  movementHistory: (params = {}, options = {}) =>
    cachedRead(
      `stock:movements:${stableParams(params)}`,
      async () => resultOf(await api.get("/stock/movements", { params })),
      options,
    ),

  peekMovementHistory: (params = {}) =>
    peekRead(`stock:movements:${stableParams(params)}`),

  prefetchMovementHistory: (params = {}) =>
    stockService.movementHistory(params).catch(() => null),

  purchase: async (payload) => {
    const data = dataOf(await api.post("/stock/in", payload));
    invalidateRead("stock:");
    invalidateRead("products:");
    invalidateRead("dashboard");
    return data;
  },

  sale: async (payload) => {
    const data = dataOf(await api.post("/stock/out", payload));
    invalidateRead("stock:");
    invalidateRead("products:");
    invalidateRead("dashboard");
    return data;
  },

  purchaseHistory: async (params = {}) =>
    resultOf(
      await api.get("/stock/invoices/purchases", {
        params,
      }),
    ),

  salesHistory: async (params = {}) =>
    resultOf(
      await api.get("/stock/invoices/sales", {
        params,
      }),
    ),
};

// ==========================================
// DEBTORS
// ==========================================

const DEBTOR_LIST_CACHE_MS = 30_000;
const debtorListCache = new Map();
const debtorListPending = new Map();

const debtorListKey = (params = {}) =>
  JSON.stringify({
    search: String(params.search || "").trim(),
    limit: Number(params.limit || 100),
  });

const fetchDebtorList = async (params = {}, { force = false } = {}) => {
  const key = debtorListKey(params);
  const cached = debtorListCache.get(key);

  if (!force && cached && Date.now() - cached.savedAt < DEBTOR_LIST_CACHE_MS) {
    return cached.value;
  }

  if (!force && debtorListPending.has(key)) {
    return debtorListPending.get(key);
  }

  const request = resultOf(
    await api.get("/debtors", {
      params,
    }),
  );

  debtorListCache.set(key, {
    value: request,
    savedAt: Date.now(),
  });

  return request;
};

const loadDebtorList = (params = {}, options = {}) => {
  const key = debtorListKey(params);

  if (!options.force && debtorListPending.has(key)) {
    return debtorListPending.get(key);
  }

  const promise = fetchDebtorList(params, options).finally(() => {
    debtorListPending.delete(key);
  });

  debtorListPending.set(key, promise);
  return promise;
};

const invalidateDebtorList = () => {
  debtorListCache.clear();
  debtorListPending.clear();
  invalidateRead("debtors:");
  invalidateRead("dashboard");
  invalidateRead("reports:");
};

export const debtorService = {
  list: (params = {}, options = {}) =>
    loadDebtorList(params, options),

  prefetchList: (params = {}) =>
    loadDebtorList(params).catch(() => null),

  peekList: (params = {}) =>
    debtorListCache.get(debtorListKey(params))?.value || null,

  create: async (payload) => {
    const data = dataOf(await api.post("/debtors", payload));
    invalidateDebtorList();
    return data;
  },

  get: (id, options = {}) =>
    cachedRead(
      `debtors:get:${id}`,
      async () => dataOf(await api.get(`/debtors/${id}`)),
      options,
    ),

  prefetch: (id) =>
    debtorService.get(id).catch(() => null),

  peek: (id) =>
    peekRead(`debtors:get:${id}`),

  update: async (id, payload) => {
    const data = dataOf(
      await api.put(`/debtors/${id}`, payload),
    );
    invalidateDebtorList();
    return data;
  },

  remove: async (id) => {
    const data = dataOf(await api.delete(`/debtors/${id}`));
    invalidateDebtorList();
    return data;
  },

  payment: async (id, payload) => {
    const data = dataOf(
      await api.post(
        `/debtors/${id}/payments`,
        payload,
      ),
    );
    invalidateDebtorList();
    return data;
  },

  balance: async (id, payload) => {
    const data = dataOf(
      await api.post(
        `/debtors/${id}/balances`,
        payload,
      ),
    );
    invalidateDebtorList();
    return data;
  },

  // Edit debtor payment
  updatePayment: async (
    id,
    paymentId,
    payload,
  ) => {
    const data = dataOf(
      await api.put(
        `/debtors/${id}/payments/${paymentId}`,
        payload,
      ),
    );
    invalidateDebtorList();
    return data;
  },

  // Edit debtor balance/bill
  updateBalance: async (
    id,
    balanceId,
    payload,
  ) => {
    const data = dataOf(
      await api.put(
        `/debtors/${id}/balances/${balanceId}`,
        payload,
      ),
    );
    invalidateDebtorList();
    return data;
  },

  deletePayment: async (id, paymentId) => {
    const data = dataOf(await api.delete(`/debtors/${id}/payments/${paymentId}`));
    invalidateDebtorList();
    return data;
  },

  deleteBalance: async (id, balanceId) => {
    const data = dataOf(await api.delete(`/debtors/${id}/balances/${balanceId}`));
    invalidateDebtorList();
    return data;
  },

  sendWeeklyWhatsAppTest: async (id) =>
    dataOf(await api.post(`/whatsapp-test/weekly/${id}`)),

  sendFullWhatsAppTest: async (id) =>
    dataOf(await api.post(`/whatsapp-test/full/${id}`)),
};

// ==========================================
// REPRESENTATIVES / بارچلان
// ==========================================

export const representativeService = {
  list: (params = {}, options = {}) =>
    cachedRead(
      `representatives:list:${stableParams(params)}`,
      async () => resultOf(await api.get("/representatives", { params })),
      options,
    ),

  peekList: (params = {}) =>
    peekRead(`representatives:list:${stableParams(params)}`),

  prefetchList: (params = {}) =>
    representativeService.list(params).catch(() => null),

  get: (id, options = {}) =>
    cachedRead(
      `representatives:get:${id}`,
      async () => dataOf(await api.get(`/representatives/${id}`)),
      options,
    ),

  prefetch: (id) =>
    representativeService.get(id).catch(() => null),

  peek: (id) =>
    peekRead(`representatives:get:${id}`),

  getDelivery: (id, deliveryId, options = {}) =>
    cachedRead(
      `representatives:delivery:${id}:${deliveryId}`,
      async () => dataOf(await api.get(`/representatives/${id}/deliveries/${deliveryId}`)),
      options,
    ),

  peekDelivery: (id, deliveryId) =>
    peekRead(`representatives:delivery:${id}:${deliveryId}`),

  prefetchDelivery: (id, deliveryId) =>
    representativeService.getDelivery(id, deliveryId).catch(() => null),

  account: (id, options = {}) =>
    cachedRead(
      `representatives:account:${id}`,
      async () => dataOf(await api.get(`/representatives/${id}/account`)),
      options,
    ),

  peekAccount: (id) =>
    peekRead(`representatives:account:${id}`),

  prefetchAccount: (id) =>
    representativeService.account(id).catch(() => null),

  create: async (payload) => {
    const data = dataOf(await api.post("/representatives", payload));
    invalidateRead("representatives:");
    invalidateRead("dashboard");
    return data;
  },

  update: async (id, payload) => {
    const data = dataOf(await api.put(`/representatives/${id}`, payload));
    invalidateRead("representatives:");
    invalidateRead("dashboard");
    return data;
  },

  remove: async (id) => {
    const data = dataOf(await api.delete(`/representatives/${id}`));
    invalidateRead("representatives:");
    invalidateRead("dashboard");
    return data;
  },

  // New receipt
  receipt: async (id, payload) => {
    const data = dataOf(await api.post(`/representatives/${id}/receipts`, payload));
    invalidateRead("representatives:");
    invalidateRead("dashboard");
    return data;
  },

  // Edit representative receipt
  updateReceipt: async (id, receiptId, payload) => {
    const data = dataOf(await api.put(`/representatives/${id}/receipts/${receiptId}`, payload));
    invalidateRead("representatives:");
    invalidateRead("dashboard");
    return data;
  },

  deleteReceipt: async (id, receiptId) => {
    const data = dataOf(await api.delete(`/representatives/${id}/receipts/${receiptId}`));
    invalidateRead("representatives:");
    invalidateRead("dashboard");
    return data;
  },

  delivery: async (id, payload) => {
    const data = dataOf(await api.post(`/representatives/${id}/deliveries`, payload));
    invalidateRead("representatives:");
    invalidateRead("dashboard");
    return data;
  },

  updateDelivery: async (id, deliveryId, payload) => {
    const data = dataOf(await api.put(`/representatives/${id}/deliveries/${deliveryId}`, payload));
    invalidateRead("representatives:");
    invalidateRead("dashboard");
    return data;
  },

  deliverPartial: async (id, deliveryId, payload) => {
    const data = dataOf(await api.post(`/representatives/${id}/deliveries/${deliveryId}/deliver`, payload));
    invalidateRead("representatives:");
    invalidateRead("dashboard");
    return data;
  },

  removeDelivery: async (id, deliveryId) => {
    const data = dataOf(await api.delete(`/representatives/${id}/deliveries/${deliveryId}`));
    invalidateRead("representatives:");
    invalidateRead("dashboard");
    return data;
  },
};

// ==========================================
// REPORTS
// ==========================================

export const reportService = {
  get: (params = {}, options = {}) =>
    cachedRead(
      `reports:${stableParams(params)}`,
      async () => dataOf(await api.get("/reports", { params })),
      options,
    ),
  peek: (params = {}) => peekRead(`reports:${stableParams(params)}`),
  prefetch: (params = {}) => reportService.get(params).catch(() => null),
};

// ==========================================
// NOTIFICATIONS
// ==========================================

export const notificationService = {
  list: (params = {}, options = {}) =>
    cachedRead(
      `notifications:${stableParams(params)}`,
      async () => resultOf(await api.get("/notifications", { params })),
      options,
    ),

  peekList: (params = {}) =>
    peekRead(`notifications:${stableParams(params)}`),

  prefetchList: (params = {}) =>
    notificationService.list(params).catch(() => null),

  markRead: async (id) => {
    const data = dataOf(await api.patch(`/notifications/${id}/read`));
    invalidateRead("notifications:");
    return data;
  },

  markAllRead: async () => {
    const data = dataOf(await api.patch("/notifications/read-all"));
    invalidateRead("notifications:");
    return data;
  },

  remove: async (id) => {
    const data = dataOf(await api.delete(`/notifications/${id}`));
    invalidateRead("notifications:");
    return data;
  },
};

// ==========================================
// WAREHOUSES
// ==========================================

export const warehouseService = {
  list: (params = {}, options = {}) =>
    cachedRead(
      `warehouses:${stableParams(params)}`,
      async () => resultOf(await api.get("/warehouses", { params })),
      options,
    ),

  peekList: (params = {}) =>
    peekRead(`warehouses:${stableParams(params)}`),

  prefetchList: (params = {}) =>
    warehouseService.list(params).catch(() => null),

  create: async (payload) => {
    const data = dataOf(await api.post("/warehouses", payload));
    invalidateRead("warehouses:");
    invalidateRead("products:");
    invalidateRead("dashboard");
    return data;
  },

  update: async (id, payload) => {
    const data = dataOf(await api.put(`/warehouses/${id}`, payload));
    invalidateRead("warehouses:");
    invalidateRead("products:");
    invalidateRead("dashboard");
    return data;
  },

  remove: async (id) => {
    const data = dataOf(await api.delete(`/warehouses/${id}`));
    invalidateRead("warehouses:");
    invalidateRead("products:");
    invalidateRead("dashboard");
    return data;
  },
};

// ==========================================
// RECYCLE BIN
// ==========================================

export const recycleBinService = {
  list: async (params = {}) =>
    resultOf(
      await api.get("/recycle-bin", {
        params,
      }),
    ),

  restore: async (id) =>
    dataOf(
      await api.post(
        `/recycle-bin/${id}/restore`,
      ),
    ),

  removePermanently: async (id) =>
    dataOf(
      await api.delete(
        `/recycle-bin/${id}`,
      ),
    ),
};

// ==========================================
// UPLOAD
// ==========================================

export const uploadService = {
  companyAsset: async (file) =>
    uploadFile(
      "/uploads/company",
      file,
    ),

  profileImage: async (file) =>
    uploadFile(
      "/uploads/profile",
      file,
    ),
};

// ==========================================
// AUTH
// ==========================================

export const authService = {
  login: async (payload) =>
    dataOf(
      await api.post(
        "/auth/login",
        payload,
      ),
    ),

  profile: async () =>
    dataOf(
      await api.get("/auth/me"),
    ),

  logout: async () =>
    dataOf(
      await api.post("/auth/logout"),
    ),
};

// ==========================================
// SETTINGS
// ==========================================

export const settingsService = {
  get: (options = {}) =>
    cachedRead("settings:get", async () => dataOf(await api.get("/settings")), options),

  peek: () => peekRead("settings:get"),

  prefetch: () =>
    settingsService.get().catch(() => null),

  currentAccess: (options = {}) =>
    cachedRead(
      "settings:access",
      async () => dataOf(await api.get("/settings/access")),
      options,
    ),

  peekAccess: () => peekRead("settings:access"),

  prefetchAccess: () =>
    settingsService.currentAccess().catch(() => null),

  updateCompany: async (payload) => {
    const data = dataOf(await api.put("/settings/company", payload));
    invalidateRead("settings:");
    return data;
  },

  updateProfile: async (payload) => {
    const data = dataOf(await api.put("/settings/profile", payload));
    invalidateRead("settings:");
    return data;
  },

  changePassword: async (payload) =>
    dataOf(
      await api.put(
        "/auth/password",
        payload,
      ),
    ),

  // ==============================
  // BACKUP
  // ==============================

  backup: async () =>
    dataOf(
      await api.get(
        "/settings/backup",
      ),
    ),

  emailBackup: async (payload = {}) =>
    dataOf(
      await api.post(
        "/settings/backup-email",
        payload,
      ),
    ),

  // ==============================
  // WHATSAPP TEST MESSAGE
  // ==============================

  whatsappTest: async (payload = {}) =>
    dataOf(
      await api.post(
        "/settings/whatsapp-test",
        payload,
      ),
    ),

  whatsappAutomation: async () =>
    dataOf(await api.get("/settings/whatsapp-automation")),

  whatsappStatus: async () =>
    dataOf(await api.get("/settings/whatsapp-status")),

  updateWhatsappAutomation: async (payload = {}) =>
    dataOf(await api.put("/settings/whatsapp-automation", payload)),

  // ==============================
  // RESTORE
  // ==============================

  restore: async (payload) =>
    dataOf(
      await api.post(
        "/settings/restore",
        payload,
      ),
    ),

  // ==============================
  // USERS
  // ==============================

  users: (options = {}) =>
    cachedRead(
      "settings:users",
      async () => dataOf(await api.get("/settings/users")),
      options,
    ),

  peekUsers: () => peekRead("settings:users"),

  prefetchUsers: () =>
    settingsService.users().catch(() => null),

  createUser: async (payload) => {
    const data = dataOf(await api.post("/settings/users", {
      ...payload,
      password: payload.password || payload.login_code,
    }));
    invalidateRead("settings:");
    return data;
  },

  updateUser: async (id, payload) => {
    const data = dataOf(await api.put(`/settings/users/${id}`, payload));
    invalidateRead("settings:");
    return data;
  },

  removeUser: async (id) => {
    const data = dataOf(await api.delete(`/settings/users/${id}`));
    invalidateRead("settings:");
    return data;
  },
};