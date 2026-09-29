import { supabaseAdmin } from "../config/supabase.js";
import { asyncHandler, sendData } from "../utils/http.js";

const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const monthKey = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (key) => {
  const [year, month] = String(key).split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(year, month - 1, 1));
};

const lastMonthKeys = (count = 8) => {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
};

export const getDashboard = asyncHandler(async (request, response) => {
  // This endpoint is intentionally small and tolerant. The current Dashboard
  // loads warehouse/stock/company data from their already-working endpoints.
  // Here we only provide real debtor credit comparison data.
  const [balancesResult, invoicesResult, paymentsResult] = await Promise.all([
    supabaseAdmin.from("debtor_balance_records").select("*").limit(5000),
    supabaseAdmin.from("sales_invoices").select("*").limit(5000),
    supabaseAdmin.from("payments").select("*").limit(5000),
  ]);

  const balances = balancesResult.error ? [] : balancesResult.data || [];
  const invoices = invoicesResult.error ? [] : invoicesResult.data || [];
  const payments = paymentsResult.error ? [] : paymentsResult.data || [];

  const byMonth = new Map();
  const ensure = (key) => {
    if (!key) return null;
    if (!byMonth.has(key)) byMonth.set(key, { given: 0, received: 0 });
    return byMonth.get(key);
  };

  // Manual debtor balance / goods-credit entries are new credit given.
  for (const row of balances) {
    const key = monthKey(row.record_date || row.date || row.created_at);
    const bucket = ensure(key);
    if (bucket) bucket.given += Math.max(0, number(row.amount));
  }

  // A sales invoice only adds the unpaid part to debt. Paid-at-sale money is
  // not debt, so we prefer remaining_amount and fall back safely if needed.
  for (const row of invoices) {
    const key = monthKey(row.invoice_date || row.date || row.created_at);
    const bucket = ensure(key);
    if (!bucket) continue;
    const remaining = row.remaining_amount !== undefined && row.remaining_amount !== null
      ? number(row.remaining_amount)
      : Math.max(0, number(row.total_amount) - number(row.paid_amount));
    bucket.given += Math.max(0, remaining);
  }

  // Every saved debtor payment is real credit received.
  for (const row of payments) {
    const key = monthKey(row.payment_date || row.date || row.created_at);
    const bucket = ensure(key);
    if (bucket) bucket.received += Math.max(0, number(row.amount));
  }

  const allKeys = [...byMonth.keys()].sort();
  const runningByMonth = new Map();
  let running = 0;
  for (const key of allKeys) {
    const bucket = byMonth.get(key);
    running = Math.max(0, running + number(bucket.given) - number(bucket.received));
    runningByMonth.set(key, running);
  }

  const keys = lastMonthKeys(8);

  // Carry any older outstanding balance into the first displayed month.
  let opening = 0;
  for (const key of allKeys) {
    if (key >= keys[0]) break;
    const bucket = byMonth.get(key);
    opening = Math.max(0, opening + number(bucket.given) - number(bucket.received));
  }

  let displayedRunning = opening;
  const rawRows = keys.map((key) => {
    const bucket = byMonth.get(key) || { given: 0, received: 0 };
    displayedRunning = Math.max(0, displayedRunning + number(bucket.given) - number(bucket.received));
    return {
      month: monthLabel(key),
      monthKey: key,
      given: Math.round(number(bucket.given) * 100) / 100,
      received: Math.round(number(bucket.received) * 100) / 100,
      remaining: Math.round(displayedRunning * 100) / 100,
    };
  });

  const maxActivity = Math.max(
    1,
    ...rawRows.flatMap((row) => [row.given, row.received]),
  );

  const creditComparison = rawRows.map((row) => ({
    ...row,
    givenPercent: row.given > 0 ? Math.max(4, Math.round((row.given / maxActivity) * 100)) : 0,
    receivedPercent: row.received > 0 ? Math.max(4, Math.round((row.received / maxActivity) * 100)) : 0,
  }));

  return sendData(response, { creditComparison }, "Dashboard credit comparison loaded");
});
