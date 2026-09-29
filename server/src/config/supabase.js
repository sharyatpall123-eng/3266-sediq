import { createClient } from "@supabase/supabase-js";
import { databaseConfigured, env } from "./env.js";

export const supabaseAuth = databaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export const supabaseAdmin = databaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export function assertDatabase() {
  if (!databaseConfigured || !supabaseAdmin || !supabaseAuth) {
    const error = new Error("Supabase لا نه دی تنظیم شوی. server/.env فایل بشپړ کړئ.");
    error.statusCode = 503;
    throw error;
  }
}
