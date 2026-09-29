import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";
import { createDatabaseBackup, sendBackupEmail } from "../services/backupEmailService.js";
import {
  getWhatsAppWebStatus,
  sendWhatsAppTestMessage,
} from "../services/whatsappService.js";


const generatedColumns = {
  products: ["stock_status"],
  purchase_invoice_items: ["total_amount"],
  sales_invoice_items: ["total_amount"],
};

const sanitizeRestoreRows = (table, rows) => rows.map((row) => {
  const clean = { ...row };
  for (const column of generatedColumns[table] || []) delete clean[column];
  return clean;
});

const backupTables = [
  "company_settings",
  "products",
  "suppliers",
  "customers",
  "purchase_invoices",
  "purchase_invoice_items",
  "sales_invoices",
  "sales_invoice_items",
  "payments",
  "stock_movements",
  "representatives",
  "representative_deliveries",
  "representative_receipts",
  "notifications",
];

export const getSettings = asyncHandler(async (request, response) => {
  const [{ data: company, error }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("company_settings").select("*").eq("id", 1).maybeSingle(),
    supabaseAdmin.from("profiles").select("*").eq("id", request.auth.user.id).single(),
  ]);
  if (error) throw new ApiError(400, error.message);
  return sendData(response, { company: company || {}, profile });
});

export const updateCompany = asyncHandler(async (request, response) => {
  const allowed = ["company_name", "logo_url", "address", "phone", "email", "currency", "date_format", "backup_email", "backup_email_enabled", "backup_email_frequency"];
  const payload = {};
  for (const key of allowed) if (request.body[key] !== undefined) payload[key] = request.body[key];
  const { data, error } = await supabaseAdmin.from("company_settings").upsert({ id: 1, ...payload, updated_by: request.auth.user.id }).select().single();
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data, "Company settings updated");
});

export const updateProfile = asyncHandler(async (request, response) => {
  const payload = {
    full_name: String(request.body.full_name || "").trim(),
    phone: String(request.body.phone || "").trim() || null,
    avatar_url: String(request.body.avatar_url || "").trim() || null,
  };
  if (!payload.full_name) throw new ApiError(400, "Full name ضروري دی.");
  const { data, error } = await supabaseAdmin.from("profiles").update(payload).eq("id", request.auth.user.id).select().single();
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data, "Profile updated");
});

export const backupDatabase = asyncHandler(async (request, response) => {
  const backup = await createDatabaseBackup(request.auth.user.id);
  return sendData(response, backup, "Backup created");
});

export const sendDatabaseBackupEmail = asyncHandler(async (request, response) => {
  if (request.auth.profile.role !== "administrator") throw new ApiError(403, "Backup email یوازې Administrator کولی شي.");
  const { data: company, error } = await supabaseAdmin.from("company_settings").select("backup_email").eq("id", 1).maybeSingle();
  if (error) throw new ApiError(400, error.message);
  const recipient = String(request.body?.email || company?.backup_email || "").trim();
  try {
    const result = await sendBackupEmail({ to: recipient, createdBy: request.auth.user.id });
    await supabaseAdmin.from("company_settings").update({ backup_email: recipient, last_backup_email_at: new Date().toISOString() }).eq("id", 1);
    return sendData(response, result, "Backup emailed");
  } catch (error) {
    throw new ApiError(400, error.message);
  }
});

export const getWhatsAppConnectionStatus = asyncHandler(async (request, response) => {
  if (request.auth.profile.role !== "administrator") {
    throw new ApiError(403, "WhatsApp QR یوازې Administrator لیدلی شي.");
  }

  const status = await getWhatsAppWebStatus();
  return sendData(response, status, "WhatsApp Web status loaded");
});


export const testWhatsAppMessage = asyncHandler(async (request, response) => {
  const phone = String(request.body?.phone || request.body?.to || "").trim();
  const message = String(
    request.body?.message ||
      request.body?.text ||
      "السلام علیکم، دا د AZI System د WhatsApp اتومات سیستم ازمایښتي پیغام دی."
  ).trim();

  if (!phone) throw new ApiError(400, "د WhatsApp نمبر ولیکئ.");

  try {
    const result = await sendWhatsAppTestMessage({ to: phone, text: message });
    console.log(`✅ WhatsApp test message sent to ${result.phone}`);
    return sendData(response, result, "WhatsApp test message sent");
  } catch (error) {
    console.error("❌ WhatsApp test message failed:", error?.message || error);
    throw new ApiError(400, error?.message || "WhatsApp test message failed.");
  }
});

export const restoreDatabase = asyncHandler(async (request, response) => {
  if (request.auth.profile.role !== "administrator") throw new ApiError(403, "Restore یوازې Administrator کولی شي.");
  const tables = request.body?.tables;
  if (!tables || typeof tables !== "object") throw new ApiError(400, "Backup file ناسم دی.");

  const restored = {};
  for (const table of backupTables) {
    const rows = tables[table];
    if (!Array.isArray(rows) || !rows.length) {
      restored[table] = 0;
      continue;
    }
    const cleanRows = sanitizeRestoreRows(table, rows);
    const { error } = await supabaseAdmin.from(table).upsert(cleanRows, { onConflict: "id" });
    if (error) throw new ApiError(400, `Restore failed at ${table}: ${error.message}`);
    restored[table] = rows.length;
  }
  await supabaseAdmin.from("activity_logs").insert({ user_id: request.auth.user.id, action: "database_restored", entity_type: "settings", details: restored });
  return sendData(response, restored, "Database restored");
});


export const listUsers = asyncHandler(async (request, response) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email,username,full_name,phone,avatar_url,role,is_active,permissions,permissions_mode,created_at")
    .order("created_at", { ascending: true });
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data || [], "Users loaded");
});

export const createUser = asyncHandler(async (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  const username = String(request.body.username || "").trim();
  const fullName = String(request.body.full_name || "").trim();
  const password = String(request.body.password || "");
  const role = ["administrator", "manager", "cashier", "store_keeper"].includes(request.body.role) ? request.body.role : "cashier";
  if (!email.includes("@") || !username || !fullName || password.length < 8) {
    throw new ApiError(400, "Email، Username، Full Name او لږ تر لږه 8 توري Password ضروري دي.");
  }
  const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });
  if (authError) throw new ApiError(400, authError.message);
  const { data, error } = await supabaseAdmin.from("profiles").update({
    email,
    username,
    full_name: fullName,
    phone: String(request.body.phone || "").trim() || null,
    role,
    is_active: true,
    permissions: role === "administrator" ? ["*"] : (Array.isArray(request.body.permissions) ? request.body.permissions : []),
    permissions_mode: "custom",
  }).eq("id", created.user.id).select().single();
  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    throw new ApiError(400, error.message);
  }
  await supabaseAdmin.from("activity_logs").insert({ user_id: request.auth.user.id, action: "user_created", entity_type: "user", entity_id: data.id, details: { username, role } });
  return sendData(response, data, "User created", 201);
});

export const updateUser = asyncHandler(async (request, response) => {
  const payload = {};
  if (request.body.full_name !== undefined) payload.full_name = String(request.body.full_name).trim();
  if (request.body.phone !== undefined) payload.phone = String(request.body.phone).trim() || null;
  if (["administrator", "manager", "cashier", "store_keeper"].includes(request.body.role)) payload.role = request.body.role;
  if (typeof request.body.is_active === "boolean") payload.is_active = request.body.is_active;
  if (Array.isArray(request.body.permissions)) { payload.permissions = request.body.permissions; payload.permissions_mode = "custom"; }
  if (!Object.keys(payload).length) throw new ApiError(400, "No user changes supplied.");
  if (request.params.id === request.auth.user.id && payload.is_active === false) throw new ApiError(400, "خپل account غیر فعالولای نه شئ.");
  const { data, error } = await supabaseAdmin.from("profiles").update(payload).eq("id", request.params.id).select().single();
  if (error) throw new ApiError(400, error.message);
  await supabaseAdmin.from("activity_logs").insert({ user_id: request.auth.user.id, action: "user_updated", entity_type: "user", entity_id: data.id, details: payload });
  return sendData(response, data, "User updated");
});

export const currentAccess = asyncHandler(async (request, response) => {
  const profile = request.auth.profile;
  const permissions = profile.role === "administrator" ? ["*"] : (Array.isArray(profile.permissions) ? profile.permissions : []);
  return sendData(response, { profile, permissions, role: profile.role });
});

export const removeUser = asyncHandler(async (request, response) => {
  if (request.params.id === request.auth.user.id) throw new ApiError(400, "خپل account حذفولای نه شئ.");
  const { data: profile, error: findError } = await supabaseAdmin.from("profiles").select("*").eq("id", request.params.id).single();
  if (findError || !profile) throw new ApiError(404, "User پیدا نه شو.");
  const { error } = await supabaseAdmin.auth.admin.deleteUser(request.params.id);
  if (error) throw new ApiError(400, error.message);
  return sendData(response, { id: request.params.id }, "User deleted");
});


const whatsappAutomationDefaults = {
  id: 1,
  automation_enabled: true,
  payment_receipt_enabled: true,
  weekly_report_enabled: true,
  weekly_day: 4,
  weekly_hour: 9,
  weekly_minute: 0,
  full_report_enabled: true,
  full_report_interval_weeks: 3,
  full_report_hour: 10,
  full_report_minute: 0,
  timezone: "Asia/Kabul",
};

export const getWhatsAppAutomationSettings = asyncHandler(async (request, response) => {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_automation_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new ApiError(400, error.message);
  return sendData(response, { ...whatsappAutomationDefaults, ...(data || {}) });
});

export const updateWhatsAppAutomationSettings = asyncHandler(async (request, response) => {
  const allowed = [
    "automation_enabled",
    "payment_receipt_enabled",
    "weekly_report_enabled",
    "weekly_day",
    "weekly_hour",
    "weekly_minute",
    "full_report_enabled",
    "full_report_interval_weeks",
    "full_report_hour",
    "full_report_minute",
    "timezone",
  ];

  const payload = {};
  for (const key of allowed) {
    if (request.body?.[key] !== undefined) payload[key] = request.body[key];
  }

  const { data, error } = await supabaseAdmin
    .from("whatsapp_automation_settings")
    .upsert({ id: 1, ...payload, updated_at: new Date().toISOString() })
    .select("*")
    .single();

  if (error) throw new ApiError(400, error.message);
  return sendData(response, data, "WhatsApp automation settings updated");
});
