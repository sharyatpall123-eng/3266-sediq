export const ROLE_PERMISSION_PRESETS = {
  administrator: ["*"],

  manager: [
    "dashboard.view",
    "warehouse.view",
    "warehouse.manage",
    "warehouse.delete",
    "stock.in",
    "stock.out",
    "debtors.view",
    "debtors.manage",
    "debtors.delete",
    "debtors.view_total",
    "representatives.view",
    "representatives.manage",
    "representatives.delete",
    "transit.view_total_value",
    "reports.view",
    "notifications.view",
    "settings.view",
    "settings.company",
    "recycle.restore",
  ],

  store_keeper: [
    "dashboard.view",
    "warehouse.view",
    "warehouse.manage",
    "stock.in",
    "stock.out",
    "representatives.view",
    "notifications.view",
    "settings.view",
  ],

  cashier: [
    "dashboard.view",
    "warehouse.view",
    "stock.out",
    "debtors.view",
    "debtors.manage",
    "notifications.view",
    "settings.view",
  ],
};

export const USER_PERMISSION_OPTIONS = [
  { key: "dashboard.view", label: "Dashboard کتل", group: "عمومي" },

  { key: "warehouse.view", label: "ګودام کتل", group: "ګودام" },
  { key: "warehouse.manage", label: "ګودام / جنس مدیریت", group: "ګودام" },
  { key: "warehouse.delete", label: "ګودام / جنس حذف", group: "ګودام" },
  { key: "stock.in", label: "Stock In", group: "ګودام" },
  { key: "stock.out", label: "Stock Out", group: "ګودام" },

  { key: "debtors.view", label: "قرضداران کتل", group: "قرضداران" },
  { key: "debtors.manage", label: "قرضداران مدیریت", group: "قرضداران" },
  { key: "debtors.delete", label: "قرضدار حذف", group: "قرضداران" },
  {
    key: "debtors.view_total",
    label: "د ټولو قرضونو جمله مبلغ کتل",
    group: "حساس معلومات",
  },

  { key: "representatives.view", label: "کمپنۍ کتل", group: "کمپنۍ" },
  { key: "representatives.manage", label: "کمپنۍ مدیریت", group: "کمپنۍ" },
  { key: "representatives.delete", label: "کمپنۍ حذف", group: "کمپنۍ" },
  {
    key: "transit.view_total_value",
    label: "د لارې مالونو جمله ارزښت کتل",
    group: "حساس معلومات",
  },

  { key: "reports.view", label: "راپورونه کتل", group: "راپورونه" },
  { key: "notifications.view", label: "Notifications کتل", group: "عمومي" },
  { key: "settings.view", label: "Settings کتل", group: "تنظیمات" },
  { key: "settings.company", label: "د شرکت Settings بدلول", group: "تنظیمات" },
  { key: "users.manage", label: "Users مدیریت", group: "تنظیمات" },

  { key: "recycle.restore", label: "Recycle Bin Restore", group: "Recycle Bin" },
  { key: "recycle.delete", label: "دایمي حذف", group: "Recycle Bin" },
];

export function getRolePermissions(role) {
  return [...(ROLE_PERMISSION_PRESETS[role] || ROLE_PERMISSION_PRESETS.cashier)];
}

export function can(profile, permission) {
  if (!profile) return false;
  if (profile.role === "administrator") return true;

  const explicit = Array.isArray(profile.permissions)
    ? profile.permissions
    : [];

  if (profile.permissions_mode === "custom") {
    return explicit.includes("*") || explicit.includes(permission);
  }

  if (explicit.length > 0) {
    return explicit.includes("*") || explicit.includes(permission);
  }

  const defaults =
    ROLE_PERMISSION_PRESETS[profile.role] || ROLE_PERMISSION_PRESETS.cashier;

  return defaults.includes("*") || defaults.includes(permission);
}
