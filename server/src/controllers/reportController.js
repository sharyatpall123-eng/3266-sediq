import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n = (value) => Math.max(0, Number(value || 0));

export const getReports = asyncHandler(async (request, response) => {
  const now = new Date();
  const from = String(request.query.from || `${now.getFullYear()}-01-01`);
  const to = String(request.query.to || now.toISOString().slice(0, 10));

  const [productsR, customersR, movementsR, paymentsR, balancesR, warehousesR] = await Promise.all([
    supabaseAdmin.from("products").select("*").eq("is_active", true),
    supabaseAdmin.from("customers").select("*").eq("is_active", true),
    supabaseAdmin.from("stock_movements").select("*").gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59.999`).order("created_at", { ascending: false }),
    supabaseAdmin.from("payments").select("*,customers(name,phone,currency)").gte("payment_date", from).lte("payment_date", to).order("payment_date", { ascending: false }),
    supabaseAdmin.from("debtor_balance_records").select("*,customers(name,phone,currency)").gte("record_date", from).lte("record_date", to).order("record_date", { ascending: false }),
    supabaseAdmin.from("warehouses").select("id").eq("is_active", true),
  ]);

  const failed = [productsR, customersR, movementsR, paymentsR, balancesR, warehousesR].find((r) => r.error);
  if (failed?.error) throw new ApiError(400, failed.error.message);

  const products = productsR.data || [];
  const customers = customersR.data || [];
  const movements = movementsR.data || [];
  const payments = paymentsR.data || [];
  const balances = balancesR.data || [];

  const monthly = monthLabels.map((label) => ({ label, stockIn: 0, stockOut: 0 }));
  const productMap = new Map(products.map((product) => [product.id, product]));

  for (const row of movements) {
    const month = new Date(row.created_at).getMonth();
    if (month < 0 || month > 11) continue;

    const type = String(row.movement_type || row.type || "").trim().toLowerCase();
    if (type === "in" || type === "stock_in") monthly[month].stockIn += n(row.quantity);
    if (type === "out" || type === "stock_out") monthly[month].stockOut += n(row.quantity);
  }

  const stockInTotal = movements.reduce((sum, row) => {
    const type = String(row.movement_type || row.type || "").trim().toLowerCase();
    return sum + (type === "in" || type === "stock_in" ? n(row.quantity) : 0);
  }, 0);

  const stockOutTotal = movements.reduce((sum, row) => {
    const type = String(row.movement_type || row.type || "").trim().toLowerCase();
    return sum + (type === "out" || type === "stock_out" ? n(row.quantity) : 0);
  }, 0);

  const categoryMap = new Map();
  for (const product of products) {
    const name = String(product.category || "نور").trim() || "نور";
    const row = categoryMap.get(name) || { name, quantity: 0, value: 0 };
    row.quantity += n(product.quantity);
    row.value += n(product.quantity) * n(product.purchase_price);
    categoryMap.set(name, row);
  }

  const categories = [...categoryMap.values()].sort((a, b) => b.quantity - a.quantity);
  const topProducts = products
    .map((product) => ({ id: product.id, name: product.name, quantity: n(product.quantity), unit: product.unit || "", value: n(product.quantity) * n(product.purchase_price) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const debtAFN = customers.filter((d) => d.currency !== "USD").reduce((s, d) => s + n(d.current_balance), 0);
  const debtUSD = customers.filter((d) => d.currency === "USD").reduce((s, d) => s + n(d.current_balance), 0);
  const stockUnits = products.reduce((s, p) => s + n(p.quantity), 0);
  const stockValue = products.reduce((s, p) => s + n(p.quantity) * n(p.purchase_price), 0);
  const lowStock = products.filter((p) => n(p.quantity) > 0 && n(p.quantity) <= n(p.min_stock)).length;
  const outOfStock = products.filter((p) => n(p.quantity) <= 0).length;

  return sendData(response, {
    summary: {
      totalDebtors: customers.length,
      activeDebts: customers.filter((d) => n(d.current_balance) > 0).length,
      debtAFN,
      debtUSD,
      canViewDebtTotal: true,
      totalProducts: products.length,
      stockUnits,
      stockValue,
      lowStock,
      outOfStock,
      totalWarehouses: warehousesR.data?.length || 0,
      receiptCount: payments.length,
      transferBillCount: balances.length,
      stockInTotal,
      stockOutTotal,
      stockMovementCount: movements.length,
    },
    monthly,
    recentStockMovements: movements.slice(0, 30).map((row) => {
      const product = productMap.get(row.product_id);
      const rawType = String(row.movement_type || row.type || "").trim().toLowerCase();
      return {
        id: row.id,
        type: rawType === "stock_in" ? "in" : rawType === "stock_out" ? "out" : rawType,
        product_id: row.product_id,
        product_name: product?.name || "نامعلوم جنس",
        unit: product?.unit || "",
        quantity: n(row.quantity),
        balance_after: n(row.balance_after),
        reference_type: row.reference_type || "direct",
        reference_id: row.reference_id || null,
        note: row.notes || "",
        date: row.created_at?.slice(0, 10) || "",
        created_at: row.created_at,
      };
    }),
    recentReceipts: payments.slice(0, 20).map((row) => ({
      id: row.id,
      customer_name: row.customers?.name || "—",
      party_name: row.customers?.name || "—",
      phone: row.customers?.phone || "—",
      amount: n(row.amount),
      currency: row.customers?.currency || "AFN",
      date: row.payment_date,
      payment_date: row.payment_date,
      method: row.method,
    })),
    recentTransferBills: balances.slice(0, 20).map((row) => ({
      id: row.id,
      customer_name: row.customers?.name || "—",
      party_name: row.customers?.name || "—",
      phone: row.customers?.phone || "—",
      amount: n(row.amount),
      currency: row.customers?.currency || "AFN",
      date: row.record_date,
      type: row.type,
      bill_number: row.bill_number || "",
      note: row.note || "",
    })),
    categories,
    topProducts,
  });
});
