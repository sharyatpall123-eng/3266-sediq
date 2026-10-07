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
  // One compact endpoint replaces several browser requests and avoids the
  // representative N+1 query pattern on the dashboard.
  const [
    warehousesResult,
    productsResult,
    movementsResult,
    representativesResult,
    deliveriesResult,
    balancesResult,
    invoicesResult,
    paymentsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("warehouses")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabaseAdmin
      .from("products")
      .select("quantity,min_stock")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("stock_movements")
      .select("id,movement_type,quantity,created_at,product_id,products(name,unit)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("representatives")
      .select("id,name")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("representative_deliveries")
      .select("representative_id,quantity,delivered_quantity"),
    supabaseAdmin
      .from("debtor_balance_records")
      .select("amount,record_date,created_at")
      .limit(5000),
    supabaseAdmin
      .from("sales_invoices")
      .select("remaining_amount,total_amount,paid_amount,invoice_date,created_at")
      .limit(5000),
    supabaseAdmin
      .from("payments")
      .select("amount,payment_date,created_at")
      .limit(5000),
  ]);

  const products = productsResult.error ? [] : productsResult.data || [];
  const movements = movementsResult.error ? [] : movementsResult.data || [];
  const representatives = representativesResult.error ? [] : representativesResult.data || [];
  const deliveries = deliveriesResult.error ? [] : deliveriesResult.data || [];
  const balances = balancesResult.error ? [] : balancesResult.data || [];
  const invoices = invoicesResult.error ? [] : invoicesResult.data || [];
  const payments = paymentsResult.error ? [] : paymentsResult.data || [];

  const stockIn = movements
    .filter((row) => String(row.movement_type || "").toLowerCase() === "in")
    .reduce((sum, row) => sum + number(row.quantity), 0);
  const stockOut = movements
    .filter((row) => String(row.movement_type || "").toLowerCase() === "out")
    .reduce((sum, row) => sum + number(row.quantity), 0);
  const netBalance = products.reduce((sum, row) => sum + number(row.quantity), 0);
  const lowStock = products.filter(
    (row) => number(row.quantity) <= number(row.min_stock),
  ).length;

  const remainingGoodsByRepresentative = new Map();
  for (const row of deliveries) {
    const current = remainingGoodsByRepresentative.get(row.representative_id) || 0;
    const remaining = Math.max(0, number(row.quantity) - number(row.delivered_quantity));
    remainingGoodsByRepresentative.set(row.representative_id, current + remaining);
  }

  const companyDistribution = representatives
    .map((row) => ({
      name: row.name,
      value: Math.max(0, remainingGoodsByRepresentative.get(row.id) || 0),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const recentMovements = movements.slice(0, 8).map((row) => ({
    id: row.id,
    type: row.movement_type,
    movement_type: row.movement_type,
    quantity: number(row.quantity),
    created_at: row.created_at,
    product_id: row.product_id,
    product_name: row.products?.name || "Product",
    unit: row.products?.unit || "",
  }));

  const byMonth = new Map();
  const ensure = (key) => {
    if (!key) return null;
    if (!byMonth.has(key)) byMonth.set(key, { given: 0, received: 0 });
    return byMonth.get(key);
  };

  for (const row of balances) {
    const key = monthKey(row.record_date || row.created_at);
    const bucket = ensure(key);
    if (bucket) bucket.given += Math.max(0, number(row.amount));
  }

  for (const row of invoices) {
    const key = monthKey(row.invoice_date || row.created_at);
    const bucket = ensure(key);
    if (!bucket) continue;
    const remaining = row.remaining_amount !== undefined && row.remaining_amount !== null
      ? number(row.remaining_amount)
      : Math.max(0, number(row.total_amount) - number(row.paid_amount));
    bucket.given += Math.max(0, remaining);
  }

  for (const row of payments) {
    const key = monthKey(row.payment_date || row.created_at);
    const bucket = ensure(key);
    if (bucket) bucket.received += Math.max(0, number(row.amount));
  }

  const allKeys = [...byMonth.keys()].sort();
  const keys = lastMonthKeys(8);

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

  return sendData(
    response,
    {
      summary: {
        totalWarehouses: warehousesResult.error ? 0 : warehousesResult.count || 0,
        stockIn,
        stockOut,
        netBalance,
        lowStock,
      },
      recentMovements,
      companyDistribution,
      creditComparison,
    },
    "Dashboard loaded",
  );
});
