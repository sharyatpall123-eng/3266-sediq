import api from "../lib/api";

const dataOf = (response) => response?.data?.data;
const metaOf = (response) => response?.data?.meta || {};

const resultOf = (response) => ({
  data: dataOf(response) || [],
  meta: metaOf(response),
});

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
  get: async () =>
    dataOf(await api.get("/dashboard")),
};

// ==========================================
// PRODUCTS
// ==========================================

export const productService = {
  list: async (params = {}) =>
    resultOf(
      await api.get("/products", {
        params,
      }),
    ),

  get: async (id) =>
    dataOf(await api.get(`/products/${id}`)),

  create: async (payload) =>
    dataOf(await api.post("/products", payload)),

  update: async (id, payload) =>
    dataOf(
      await api.put(`/products/${id}`, payload),
    ),

  remove: async (id) =>
    dataOf(await api.delete(`/products/${id}`)),

  uploadImage: async (file) =>
    uploadFile("/uploads/product", file),
};

// ==========================================
// STOCK
// ==========================================

export const stockService = {
  moveIn: async (payload) =>
    dataOf(
      await api.post("/stock/move-in", payload),
    ),

  moveOut: async (payload) =>
    dataOf(
      await api.post("/stock/move-out", payload),
    ),

  movementHistory: async (params = {}) =>
    resultOf(
      await api.get("/stock/movements", {
        params,
      }),
    ),

  purchase: async (payload) =>
    dataOf(await api.post("/stock/in", payload)),

  sale: async (payload) =>
    dataOf(await api.post("/stock/out", payload)),

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

export const debtorService = {
  list: async (params = {}) =>
    resultOf(
      await api.get("/debtors", {
        params,
      }),
    ),

  create: async (payload) =>
    dataOf(await api.post("/debtors", payload)),

  get: async (id) =>
    dataOf(await api.get(`/debtors/${id}`)),

  update: async (id, payload) =>
    dataOf(
      await api.put(`/debtors/${id}`, payload),
    ),

  remove: async (id) =>
    dataOf(await api.delete(`/debtors/${id}`)),

  payment: async (id, payload) =>
    dataOf(
      await api.post(
        `/debtors/${id}/payments`,
        payload,
      ),
    ),

  balance: async (id, payload) =>
    dataOf(
      await api.post(
        `/debtors/${id}/balances`,
        payload,
      ),
    ),

  // Edit debtor payment
  updatePayment: async (
    id,
    paymentId,
    payload,
  ) =>
    dataOf(
      await api.put(
        `/debtors/${id}/payments/${paymentId}`,
        payload,
      ),
    ),

  // Edit debtor balance/bill
  updateBalance: async (
    id,
    balanceId,
    payload,
  ) =>
    dataOf(
      await api.put(
        `/debtors/${id}/balances/${balanceId}`,
        payload,
      ),
    ),

  deletePayment: async (id, paymentId) =>
    dataOf(await api.delete(`/debtors/${id}/payments/${paymentId}`)),

  deleteBalance: async (id, balanceId) =>
    dataOf(await api.delete(`/debtors/${id}/balances/${balanceId}`)),

  sendWeeklyWhatsAppTest: async (id) =>
    dataOf(await api.post(`/whatsapp-test/weekly/${id}`)),

  sendFullWhatsAppTest: async (id) =>
    dataOf(await api.post(`/whatsapp-test/full/${id}`)),
};

// ==========================================
// REPRESENTATIVES / بارچلان
// ==========================================

export const representativeService = {
  list: async (params = {}) =>
    resultOf(
      await api.get("/representatives", {
        params,
      }),
    ),

  get: async (id) =>
    dataOf(
      await api.get(`/representatives/${id}`),
    ),

  getDelivery: async (id, deliveryId) =>
    dataOf(
      await api.get(
        `/representatives/${id}/deliveries/${deliveryId}`,
      ),
    ),

  account: async (id) =>
    dataOf(
      await api.get(
        `/representatives/${id}/account`,
      ),
    ),

  create: async (payload) =>
    dataOf(
      await api.post(
        "/representatives",
        payload,
      ),
    ),

  update: async (id, payload) =>
    dataOf(
      await api.put(
        `/representatives/${id}`,
        payload,
      ),
    ),

  remove: async (id) =>
    dataOf(
      await api.delete(
        `/representatives/${id}`,
      ),
    ),

  // New receipt
  receipt: async (id, payload) =>
    dataOf(
      await api.post(
        `/representatives/${id}/receipts`,
        payload,
      ),
    ),

  // Edit representative receipt
  updateReceipt: async (
    id,
    receiptId,
    payload,
  ) =>
    dataOf(
      await api.put(
        `/representatives/${id}/receipts/${receiptId}`,
        payload,
      ),
    ),

  deleteReceipt: async (id, receiptId) =>
    dataOf(await api.delete(`/representatives/${id}/receipts/${receiptId}`)),

  delivery: async (id, payload) =>
    dataOf(
      await api.post(
        `/representatives/${id}/deliveries`,
        payload,
      ),
    ),

  updateDelivery: async (
    id,
    deliveryId,
    payload,
  ) =>
    dataOf(
      await api.put(
        `/representatives/${id}/deliveries/${deliveryId}`,
        payload,
      ),
    ),

  deliverPartial: async (
    id,
    deliveryId,
    payload,
  ) =>
    dataOf(
      await api.post(
        `/representatives/${id}/deliveries/${deliveryId}/deliver`,
        payload,
      ),
    ),

  removeDelivery: async (
    id,
    deliveryId,
  ) =>
    dataOf(
      await api.delete(
        `/representatives/${id}/deliveries/${deliveryId}`,
      ),
    ),
};

// ==========================================
// REPORTS
// ==========================================

export const reportService = {
  get: async (params = {}) =>
    dataOf(
      await api.get("/reports", {
        params,
      }),
    ),
};

// ==========================================
// NOTIFICATIONS
// ==========================================

export const notificationService = {
  list: async (params = {}) =>
    resultOf(
      await api.get("/notifications", {
        params,
      }),
    ),

  markRead: async (id) =>
    dataOf(
      await api.patch(
        `/notifications/${id}/read`,
      ),
    ),

  markAllRead: async () =>
    dataOf(
      await api.patch(
        "/notifications/read-all",
      ),
    ),

  remove: async (id) =>
    dataOf(
      await api.delete(
        `/notifications/${id}`,
      ),
    ),
};

// ==========================================
// WAREHOUSES
// ==========================================

export const warehouseService = {
  list: async (params = {}) =>
    resultOf(
      await api.get("/warehouses", {
        params,
      }),
    ),

  create: async (payload) =>
    dataOf(
      await api.post(
        "/warehouses",
        payload,
      ),
    ),

  update: async (id, payload) =>
    dataOf(
      await api.put(
        `/warehouses/${id}`,
        payload,
      ),
    ),

  remove: async (id) =>
    dataOf(
      await api.delete(
        `/warehouses/${id}`,
      ),
    ),
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
  get: async () =>
    dataOf(
      await api.get("/settings"),
    ),

  currentAccess: async () =>
    dataOf(
      await api.get(
        "/settings/access",
      ),
    ),

  updateCompany: async (payload) =>
    dataOf(
      await api.put(
        "/settings/company",
        payload,
      ),
    ),

  updateProfile: async (payload) =>
    dataOf(
      await api.put(
        "/settings/profile",
        payload,
      ),
    ),

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

  users: async () =>
    dataOf(
      await api.get(
        "/settings/users",
      ),
    ),

  createUser: async (payload) =>
    dataOf(
      await api.post(
        "/settings/users",
        {
          ...payload,
          password:
            payload.password ||
            payload.login_code,
        },
      ),
    ),

  updateUser: async (
    id,
    payload,
  ) =>
    dataOf(
      await api.put(
        `/settings/users/${id}`,
        payload,
      ),
    ),

  removeUser: async (id) =>
    dataOf(
      await api.delete(
        `/settings/users/${id}`,
      ),
    ),
};