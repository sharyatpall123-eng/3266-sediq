import { supabaseAdmin } from "../config/supabase.js";
import {
  normalizeWhatsAppPhone,
  sendPaymentReceipt,
  sendWeeklyDebtReport,
  whatsappConfigured,
  verifyWhatsAppConnection,
} from "./whatsappService.js";

const DEFAULT_TIME_ZONE = "Asia/Kabul";
const TICK_MS = 60_000;
const MAX_ATTEMPTS = 3;

let timer = null;
let running = false;

/* =========================================
   SETTINGS
========================================= */

const DEFAULT_SETTINGS = {
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
  timezone: DEFAULT_TIME_ZONE,
};

async function getAutomationSettings() {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_automation_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `WhatsApp automation settings could not be loaded: ${error.message}`,
    );
  }

  return {
    ...DEFAULT_SETTINGS,
    ...(data || {}),
  };
}

/* =========================================
   TIME HELPERS
========================================= */

function timeParts(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || DEFAULT_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
}

function dateKey(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const p = timeParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/*
  Database weekly_day:
  0 = Sunday
  1 = Monday
  2 = Tuesday
  3 = Wednesday
  4 = Thursday
  5 = Friday
  6 = Saturday
*/
function weekdayNumber(shortName) {
  const days = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return days[shortName];
}

function weeklyScheduleReached(
  settings,
  date = new Date(),
) {
  const timeZone =
    settings.timezone || DEFAULT_TIME_ZONE;

  const p = timeParts(date, timeZone);

  const currentDay = weekdayNumber(p.weekday);
  const currentHour = Number(p.hour);
  const currentMinute = Number(p.minute);

  const targetDay = Number(settings.weekly_day);
  const targetHour = Number(settings.weekly_hour);
  const targetMinute = Number(settings.weekly_minute);

  if (currentDay !== targetDay) {
    return false;
  }

  /*
    Run at the selected minute or later.

    The batch dedupe key prevents duplicate reports
    during later scheduler ticks on the same day.
  */
  if (currentHour > targetHour) {
    return true;
  }

  if (
    currentHour === targetHour &&
    currentMinute >= targetMinute
  ) {
    return true;
  }

  return false;
}

function addMinutes(date, minutes) {
  return new Date(
    date.getTime() + minutes * 60_000,
  ).toISOString();
}

/* =========================================
   PAYMENT RECEIPT JOB
========================================= */

export async function enqueuePaymentReceiptJob({
  customer,
  payment,
}) {
  if (!customer?.id || !payment?.id) {
    return {
      queued: false,
      reason: "missing_customer_or_payment",
    };
  }

  /*
    IMPORTANT:
    Read current settings BEFORE creating the job.

    Therefore:
    - OFF = no receipt job is created.
    - Turning it ON later will NOT send old receipts.
    - Only new payments created while enabled are queued.
  */
  const settings = await getAutomationSettings();

  if (!settings.automation_enabled) {
    return {
      queued: false,
      reason: "automation_disabled",
    };
  }

  if (!settings.payment_receipt_enabled) {
    return {
      queued: false,
      reason: "payment_receipt_disabled",
    };
  }

  const phone = normalizeWhatsAppPhone(
    customer.phone,
  );

  if (!phone) {
    return {
      queued: false,
      reason: "missing_phone",
    };
  }

  const dedupeKey =
    `payment_receipt:${payment.id}`;

  const payload = {
    amount: Number(payment.amount || 0),
    currency: customer.currency || "AFN",
    remaining_balance: Number(
      customer.current_balance || 0,
    ),
    payment_id: payment.id,
    payment,
  };

  const { data, error } = await supabaseAdmin
    .from("whatsapp_jobs")
    .upsert(
      {
        job_type: "payment_receipt",
        customer_id: customer.id,
        payment_id: payment.id,
        phone,
        payload,
        dedupe_key: dedupeKey,
        status: "pending",
        scheduled_for: new Date().toISOString(),
      },
      {
        onConflict: "dedupe_key",
        ignoreDuplicates: true,
      },
    )
    .select("id,status")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    queued: true,
    job: data || null,
  };
}

/* =========================================
   WEEKLY DEBT REPORT JOBS
========================================= */

export async function enqueueWeeklyDebtReports(
  date = new Date(),
  suppliedSettings = null,
) {
  const settings =
    suppliedSettings ||
    (await getAutomationSettings());

  if (!settings.automation_enabled) {
    return {
      created: false,
      reason: "automation_disabled",
    };
  }

  if (!settings.weekly_report_enabled) {
    return {
      created: false,
      reason: "weekly_report_disabled",
    };
  }

  const timeZone =
    settings.timezone || DEFAULT_TIME_ZONE;

  const currentDateKey =
    dateKey(date, timeZone);

  const batchKey =
    `weekly_debt:${currentDateKey}`;

  const { data: batch, error: batchError } =
    await supabaseAdmin
      .from("whatsapp_batches")
      .insert({
        batch_key: batchKey,
        batch_type: "weekly_debt_report",
        status: "building",
        run_date: currentDateKey,
      })
      .select("*")
      .maybeSingle();

  if (batchError) {
    if (batchError.code === "23505") {
      return {
        created: false,
        reason: "already_scheduled",
        dateKey: currentDateKey,
      };
    }

    throw batchError;
  }

  const { data: debtors, error } =
    await supabaseAdmin
      .from("customers")
      .select(
        "id,name,phone,currency,current_balance,is_active",
      )
      .eq("is_active", true)
      .gt("current_balance", 0)
      .not("phone", "is", null);

  if (error) {
    await supabaseAdmin
      .from("whatsapp_batches")
      .update({
        status: "failed",
        last_error: error.message,
      })
      .eq("id", batch.id);

    throw error;
  }

  const jobs = (debtors || [])
    .map((customer) => ({
      job_type: "weekly_debt_report",
      customer_id: customer.id,
      phone: normalizeWhatsAppPhone(
        customer.phone,
      ),
      payload: {
        scheduled_date: currentDateKey,
        balance_at_schedule: Number(
          customer.current_balance || 0,
        ),
      },
      dedupe_key:
        `${batchKey}:${customer.id}`,
      status: "pending",
      scheduled_for:
        new Date().toISOString(),
    }))
    .filter((job) => job.phone);

  if (jobs.length) {
    const { error: jobError } =
      await supabaseAdmin
        .from("whatsapp_jobs")
        .upsert(jobs, {
          onConflict: "dedupe_key",
          ignoreDuplicates: true,
        });

    if (jobError) {
      await supabaseAdmin
        .from("whatsapp_batches")
        .update({
          status: "failed",
          last_error: jobError.message,
        })
        .eq("id", batch.id);

      throw jobError;
    }
  }

  await supabaseAdmin
    .from("whatsapp_batches")
    .update({
      status: "queued",
      total_jobs: jobs.length,
    })
    .eq("id", batch.id);

  return {
    created: true,
    dateKey: currentDateKey,
    total: jobs.length,
  };
}

/* =========================================
   STALE JOBS
========================================= */

async function resetStaleJobs() {
  const stale = new Date(
    Date.now() - 10 * 60_000,
  ).toISOString();

  await supabaseAdmin
    .from("whatsapp_jobs")
    .update({
      status: "pending",
      last_error:
        "Recovered stale processing job",
    })
    .eq("status", "processing")
    .lt("updated_at", stale);
}

/* =========================================
   PROCESS ONE JOB
========================================= */

async function processOneJob(
  job,
  settings,
) {
  /*
    Check settings again immediately before sending.

    This means if the owner switches a feature OFF
    after a job was queued but before it was sent,
    the job will not be sent.
  */
  if (!settings.automation_enabled) {
    return;
  }

  if (
    job.job_type === "payment_receipt" &&
    !settings.payment_receipt_enabled
  ) {
    await supabaseAdmin
      .from("whatsapp_jobs")
      .update({
        status: "skipped",
        last_error: "payment_receipt_disabled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return;
  }

  if (
    job.job_type === "weekly_debt_report" &&
    !settings.weekly_report_enabled
  ) {
    await supabaseAdmin
      .from("whatsapp_jobs")
      .update({
        status: "skipped",
        last_error: "weekly_report_disabled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return;
  }

  const { data: claimed, error: claimError } =
    await supabaseAdmin
      .from("whatsapp_jobs")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

  if (claimError) {
    throw claimError;
  }

  if (!claimed) {
    return;
  }

  try {
    const result =
      claimed.job_type === "payment_receipt"
        ? await sendPaymentReceipt(claimed)
        : await sendWeeklyDebtReport(claimed);

    await supabaseAdmin
      .from("whatsapp_jobs")
      .update({
        status: result?.skipped
          ? "skipped"
          : "sent",

        whatsapp_message_id:
          result?.messageId || null,

        media_path:
          result?.mediaPath || null,

        last_error: result?.skipped
          ? result.reason || "skipped"
          : null,

        sent_at: result?.skipped
          ? null
          : new Date().toISOString(),

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", claimed.id);
  } catch (error) {
    const attempts =
      Number(claimed.attempts || 0) + 1;

    const failed =
      attempts >= MAX_ATTEMPTS;

    await supabaseAdmin
      .from("whatsapp_jobs")
      .update({
        status: failed
          ? "failed"
          : "pending",

        attempts,

        last_error: String(
          error?.message || error,
        ).slice(0, 2000),

        scheduled_for: failed
          ? claimed.scheduled_for
          : addMinutes(
              new Date(),
              attempts * 5,
            ),

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", claimed.id);

    console.error(
      `[WhatsApp] Job ${claimed.id} failed:`,
      error?.message || error,
    );
  }
}

/* =========================================
   PROCESS PENDING JOBS
========================================= */

export async function processPendingWhatsAppJobs(
  suppliedSettings = null,
) {
  const settings =
    suppliedSettings ||
    (await getAutomationSettings());

  if (!settings.automation_enabled) {
    return {
      processed: 0,
      configured: whatsappConfigured(),
      reason: "automation_disabled",
    };
  }

  /*
    Use the same connection verification logic
    that the receipt sending service uses.
  */
  if (!whatsappConfigured()) {
    await verifyWhatsAppConnection();
  }

  if (!whatsappConfigured()) {
    return {
      processed: 0,
      configured: false,
      reason: "whatsapp_not_connected",
    };
  }

  await resetStaleJobs();

  const enabledJobTypes = [];

  if (settings.payment_receipt_enabled) {
    enabledJobTypes.push("payment_receipt");
  }

  if (settings.weekly_report_enabled) {
    enabledJobTypes.push(
      "weekly_debt_report",
    );
  }

  if (!enabledJobTypes.length) {
    return {
      processed: 0,
      configured: true,
      reason: "all_automations_disabled",
    };
  }

  const { data: jobs, error } =
    await supabaseAdmin
      .from("whatsapp_jobs")
      .select("*")
      .eq("status", "pending")
      .in("job_type", enabledJobTypes)
      .lte(
        "scheduled_for",
        new Date().toISOString(),
      )
      .order("created_at", {
        ascending: true,
      })
      .limit(10);

  if (error) {
    throw error;
  }

  for (const job of jobs || []) {
    /*
      Re-read settings before every send.
      So an OFF switch takes effect immediately.
    */
    const latestSettings =
      await getAutomationSettings();

    await processOneJob(
      job,
      latestSettings,
    );
  }

  return {
    processed: (jobs || []).length,
    configured: true,
  };
}

/* =========================================
   AUTOMATION TICK
========================================= */

async function automationTick() {
  if (running) {
    return;
  }

  running = true;

  try {
    const settings =
      await getAutomationSettings();

    /*
      Master switch OFF:
      do absolutely nothing.
    */
    if (!settings.automation_enabled) {
      return;
    }

    /*
      WEEKLY REPORT

      Uses:
      weekly_report_enabled
      weekly_day
      weekly_hour
      weekly_minute
      timezone
    */
    if (
      settings.weekly_report_enabled &&
      weeklyScheduleReached(
        settings,
        new Date(),
      )
    ) {
      await enqueueWeeklyDebtReports(
        new Date(),
        settings,
      );
    }

    /*
      Pending payment receipts and weekly jobs.

      Connection verification happens inside
      processPendingWhatsAppJobs().
    */
    await processPendingWhatsAppJobs(
      settings,
    );
  } catch (error) {
    console.error(
      "[WhatsApp automation]",
      error?.message || error,
    );
  } finally {
    running = false;
  }
}

/* =========================================
   START
========================================= */

export function startWhatsAppAutomation() {
  if (timer) {
    return () =>
      stopWhatsAppAutomation();
  }

  console.log(
    "WhatsApp automation scheduler started. Schedule and ON/OFF settings are loaded from database.",
  );

  setTimeout(
    automationTick,
    3_000,
  );

  timer = setInterval(
    automationTick,
    TICK_MS,
  );

  timer.unref?.();

  return () =>
    stopWhatsAppAutomation();
}

/* =========================================
   STOP
========================================= */

export function stopWhatsAppAutomation() {
  if (timer) {
    clearInterval(timer);
  }

  timer = null;
}