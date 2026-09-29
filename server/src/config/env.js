import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const currentFile = fileURLToPath(import.meta.url);
const serverRoot = path.resolve(path.dirname(currentFile), "../..");

dotenv.config({ path: path.join(serverRoot, ".env") });

const isRealValue = (value) =>
  Boolean(
    value &&
      !value.includes("YOUR_") &&
      !value.includes("YOUR_PROJECT")
  );

const toBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
};

export const env = {
  // =========================
  // SERVER
  // =========================
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",

  // =========================
  // SUPABASE
  // =========================
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  passwordResetRedirect:
    process.env.PASSWORD_RESET_REDIRECT ||
    "http://localhost:5173/reset-password",

  // =========================
  // BACKUP EMAIL
  // =========================
  backupSmtpUser: process.env.BACKUP_SMTP_USER || "",
  backupSmtpAppPassword:
    process.env.BACKUP_SMTP_APP_PASSWORD || "",
  backupSmtpFrom:
    process.env.BACKUP_SMTP_FROM ||
    process.env.BACKUP_SMTP_USER ||
    "",

  // =========================
  // WHATSAPP CLOUD API
  // =========================
  whatsappEnabled: toBoolean(
    process.env.WHATSAPP_ENABLED,
    false
  ),

  whatsappAccessToken:
    process.env.WHATSAPP_ACCESS_TOKEN || "",

  whatsappPhoneNumberId:
    process.env.WHATSAPP_PHONE_NUMBER_ID || "",

  whatsappBusinessAccountId:
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",

  whatsappGraphVersion:
    process.env.WHATSAPP_GRAPH_VERSION || "v23.0",

  // Weekly debtor report template
  whatsappWeeklyTemplate:
    process.env.WHATSAPP_WEEKLY_TEMPLATE || "",

  // Receipt template
  whatsappReceiptTemplate:
    process.env.WHATSAPP_RECEIPT_TEMPLATE || "",

  // Default template language
  whatsappTemplateLanguage:
    process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US",

  // Reports bucket
  whatsappReportsBucket:
    process.env.WHATSAPP_REPORTS_BUCKET ||
    "whatsapp-reports",
};

// =========================
// DATABASE STATUS
// =========================
export const databaseConfigured =
  isRealValue(env.supabaseUrl) &&
  isRealValue(env.supabaseAnonKey) &&
  isRealValue(env.supabaseServiceRoleKey);

// =========================
// WHATSAPP STATUS
// =========================
export const whatsappConfigured =
  env.whatsappEnabled &&
  isRealValue(env.whatsappAccessToken) &&
  isRealValue(env.whatsappPhoneNumberId);