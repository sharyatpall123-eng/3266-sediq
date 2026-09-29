import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../config/supabase.js";

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

export async function createDatabaseBackup(createdBy = "system") {
  const backup = {
    version: 3,
    created_at: new Date().toISOString(),
    created_by: createdBy,
    tables: {},
  };

  for (const table of backupTables) {
    const { data, error } = await supabaseAdmin.from(table).select("*");
    if (error) throw new Error(`Backup failed at ${table}: ${error.message}`);
    backup.tables[table] = data || [];
  }
  return backup;
}

function smtpReady() {
  return Boolean(env.backupSmtpUser && env.backupSmtpAppPassword);
}

export async function sendBackupEmail({ to, createdBy = "system" }) {
  const recipient = String(to || "").trim();
  if (!recipient || !recipient.includes("@")) throw new Error("Backup email ناسم دی.");
  if (!smtpReady()) {
    throw new Error("Gmail SMTP لا نه دی تنظیم شوی. BACKUP_SMTP_USER او BACKUP_SMTP_APP_PASSWORD په server/.env کې ولیکئ.");
  }

  const backup = await createDatabaseBackup(createdBy);
  const date = new Date().toISOString().slice(0, 10);
  const json = Buffer.from(JSON.stringify(backup, null, 2), "utf8");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.backupSmtpUser, pass: env.backupSmtpAppPassword },
  });

  await transporter.sendMail({
    from: env.backupSmtpFrom || env.backupSmtpUser,
    to: recipient,
    subject: `WMS Backup - ${date}`,
    text: `WMS Pro automatic database backup. Date: ${date}`,
    attachments: [{ filename: `wms-backup-${date}.json`, content: json, contentType: "application/json" }],
  });
  return { recipient, date, bytes: json.length };
}

export function startBackupEmailAutomation() {
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running || !smtpReady()) return;
    running = true;
    try {
      const { data: settings, error } = await supabaseAdmin
        .from("company_settings")
        .select("backup_email,backup_email_enabled,backup_email_frequency,last_backup_email_at")
        .eq("id", 1)
        .maybeSingle();
      if (error || !settings?.backup_email_enabled || !settings?.backup_email) return;

      const frequency = settings.backup_email_frequency === "daily" ? "daily" : "weekly";
      const intervalMs = frequency === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const last = settings.last_backup_email_at ? new Date(settings.last_backup_email_at).getTime() : 0;
      if (last && Date.now() - last < intervalMs) return;

      await sendBackupEmail({ to: settings.backup_email, createdBy: "automatic-email-backup" });
      await supabaseAdmin
        .from("company_settings")
        .update({ last_backup_email_at: new Date().toISOString() })
        .eq("id", 1);
      console.log(`Automatic WMS backup emailed to ${settings.backup_email}`);
    } catch (error) {
      console.error("Automatic backup email failed:", error.message);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, 60 * 60 * 1000);
  setTimeout(tick, 15_000);
  return () => { stopped = true; clearInterval(timer); };
}
