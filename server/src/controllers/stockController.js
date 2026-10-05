import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";

const validateInvoice = (body, partyKey) => {
  if (!body?.[partyKey]?.name?.trim()) throw new ApiError(400, `${partyKey} name ضروري دی.`);
  if (!Array.isArray(body.items) || !body.items.length) throw new ApiError(400, "Invoice items نشته.");
  for (const item of body.items) {
    if (!item.product_id || Number(item.quantity) <= 0 || Number(item.price) < 0) throw new ApiError(400, "Invoice item ناسم دی.");
  }
};

export const createPurchase = asyncHandler(async (request, response) => {
  validateInvoice(request.body, "supplier");
  const { data, error } = await supabaseAdmin.rpc("create_purchase_invoice", {
    payload: { ...request.body, user_id: request.auth.user.id },
  });
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data, "Purchase invoice created", 201);
});

export const createSale = asyncHandler(async (request, response) => {
  validateInvoice(request.body, "customer");
  const { data, error } = await supabaseAdmin.rpc("create_sales_invoice", {
    payload: { ...request.body, user_id: request.auth.user.id },
  });
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data, "Sales invoice created", 201);
});

const listInvoiceTable = (table, relation) => asyncHandler(async (request, response) => {
  const limit = Math.min(100, Math.max(1, Number(request.query.limit || 20)));
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(`*, ${relation}(name,phone)`)
    .order("invoice_date", { ascending: false })
    .limit(limit);
  if (error) throw new ApiError(400, error.message);
  const normalized = (data || []).map((row) => ({ ...row, party_name: row[relation]?.name || "—" }));
  return sendData(response, normalized, "Invoice history loaded", 200, { total: normalized.length });
});

export const listPurchases = listInvoiceTable("purchase_invoices", "suppliers");
export const listSales = listInvoiceTable("sales_invoices", "customers");

const directMovement = (type) => asyncHandler(async (request, response) => {
  const productId = String(request.body.product_id || "");
  const quantity = Number(request.body.quantity || 0);
  if (!productId || quantity <= 0) throw new ApiError(400, "Product او مقدار ضروري دي.");

  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();
  if (productError || !product) throw new ApiError(404, "محصول پیدا نه شو.");

  const previous = Number(product.quantity || 0);
  if (type === "out" && quantity > previous) throw new ApiError(400, "موجود سټاک کافي نه دی.");
  const next = type === "in" ? previous + quantity : previous - quantity;

  const { error: updateError } = await supabaseAdmin.from("products").update({ quantity: next, updated_at: new Date().toISOString() }).eq("id", productId);
  if (updateError) throw new ApiError(400, updateError.message);

  const { data: movement, error } = await supabaseAdmin.from("stock_movements").insert({
    product_id: productId,
    movement_type: type,
    quantity,
    balance_after: next,
    reference_type: "direct",
    notes: request.body.note || null,
    created_by: request.auth.user.id,
  }).select().single();
  if (error) {
    // Keep stock consistent if movement logging fails.
    await supabaseAdmin.from("products").update({ quantity: previous }).eq("id", productId);
    throw new ApiError(400, error.message);
  }

  await supabaseAdmin.from("notifications").insert({
    type: type === "in" ? "stock_in" : "stock_out",
    title: type === "in" ? "سټاک داخل شو" : "سټاک خارج شو",
    message: `${product.name}: ${quantity} ${product.unit || "pcs"}`,
    entity_id: product.id,
  });

  return sendData(response, { movement: { ...movement, type, product_name: product.name, previous_stock: previous, new_stock: next, date: movement.created_at?.slice(0,10) }, product: { ...product, quantity: next } }, "Stock movement saved", 201);
});

export const moveStockIn = directMovement("in");
export const moveStockOut = directMovement("out");

export const listMovements = asyncHandler(async (request, response) => {
  const limit = Math.min(500, Math.max(1, Number(request.query.limit || 100)));
  let query = supabaseAdmin
    .from("stock_movements")
    .select("*,products(name,unit,warehouse_id)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (["in", "out"].includes(request.query.type)) {
    query = query.eq("movement_type", request.query.type);
  }
  if (request.query.product_id) {
    query = query.eq("product_id", request.query.product_id);
  }

  const { data, error } = await query;
  if (error) throw new ApiError(400, error.message);

  const creatorIds = [
    ...new Set((data || []).map((row) => row.created_by).filter(Boolean)),
  ];
  const creatorNames = new Map();

  if (creatorIds.length) {
    const { data: creators } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,username")
      .in("id", creatorIds);

    for (const creator of creators || []) {
      creatorNames.set(
        creator.id,
        creator.full_name || creator.username || "نامعلوم کارن",
      );
    }
  }

  const rows = (data || []).map((row) => ({
    ...row,
    type: row.movement_type,
    product_name: row.products?.name || "نامعلوم جنس",
    warehouse_id: row.products?.warehouse_id || null,
    user_name: creatorNames.get(row.created_by) || "نامعلوم کارن",
    date: row.created_at?.slice(0, 10),
    note: row.notes || "",
  }));

  return sendData(response, rows, "Movements loaded", 200, { total: rows.length });
});
