import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";

const numeric = ["quantity", "min_stock", "purchase_price", "selling_price"];
const cleanPayload = (body) => {
  const allowed = ["name", "sku", "barcode", "category", "unit", "quantity", "min_stock", "purchase_price", "selling_price", "description", "image_url", "currency", "warehouse_id"];
  const payload = {};
  for (const key of allowed) {
    if (body[key] !== undefined) payload[key] = numeric.includes(key) ? Number(body[key] || 0) : body[key];
  }
  return payload;
};

export const listProducts = asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(request.query.page || 1));
  const limit = Math.min(500, Math.max(1, Number(request.query.limit || 24)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const search = String(request.query.search || "").trim();
  const status = String(request.query.status || "all");

  let query = supabaseAdmin.from("products").select("*", { count: "exact" }).eq("is_active", true).order("created_at", { ascending: false });
  if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
  if (["out", "low", "in"].includes(status)) query = query.eq("stock_status", status);
  if (request.query.warehouse_id) query = query.eq("warehouse_id", String(request.query.warehouse_id));

  const { data, error, count } = await query.range(from, to);
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data || [], "Products loaded", 200, { total: count || 0, page, limit, totalPages: Math.max(1, Math.ceil((count || 0) / limit)) });
});

export const getProduct = asyncHandler(async (request, response) => {
  const { data, error } = await supabaseAdmin.from("products").select("*").eq("id", request.params.id).single();
  if (error || !data) throw new ApiError(404, "محصول پیدا نه شو.");
  return sendData(response, data);
});

export const createProduct = asyncHandler(async (request, response) => {
  const payload = cleanPayload(request.body);
  const quantity = Number(payload.quantity || 0);
  if (!payload.warehouse_id) throw new ApiError(400, "ګدام انتخابول ضروري دي.");
  if (quantity <= 0) throw new ApiError(400, "تعداد ضروري دی او باید له صفر څخه زیات وي.");
  if (!String(payload.name || "").trim()) payload.name = `جنس ${Date.now()}`;
  if (!String(payload.sku || "").trim()) payload.sku = `AUTO-${Date.now()}`;

  const { data, error } = await supabaseAdmin
    .from("products")
    .insert({ ...payload, quantity, created_by: request.auth.user.id })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);

  const { error: movementError } = await supabaseAdmin.from("stock_movements").insert({
    product_id: data.id,
    movement_type: "in",
    quantity,
    balance_after: quantity,
    reference_type: "product_create",
    notes: "Initial stock recorded when product was created",
    created_by: request.auth.user.id,
  });

  if (movementError) {
    await supabaseAdmin.from("products").delete().eq("id", data.id);
    throw new ApiError(400, movementError.message);
  }

  await supabaseAdmin.from("activity_logs").insert({
    user_id: request.auth.user.id,
    action: "product_created",
    entity_type: "product",
    entity_id: data.id,
    details: { name: data.name, quantity },
  });

  return sendData(response, data, "Product created", 201);
});

export const updateProduct = asyncHandler(async (request, response) => {
  const payload = cleanPayload(request.body);

  const { data: previous, error: previousError } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", request.params.id)
    .single();
  if (previousError || !previous) throw new ApiError(404, "محصول پیدا نه شو.");

  const previousQuantity = Number(previous.quantity || 0);
  const nextQuantity =
    payload.quantity === undefined ? previousQuantity : Number(payload.quantity || 0);

  if (nextQuantity < 0) throw new ApiError(400, "تعداد له صفر څخه کم نه شي کېدای.");

  const { data, error } = await supabaseAdmin
    .from("products")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", request.params.id)
    .select()
    .single();
  if (error || !data) throw new ApiError(400, error?.message || "Product update failed");

  if (nextQuantity !== previousQuantity) {
    const movementType = nextQuantity > previousQuantity ? "in" : "out";
    const difference = Math.abs(nextQuantity - previousQuantity);

    const { error: movementError } = await supabaseAdmin.from("stock_movements").insert({
      product_id: data.id,
      movement_type: movementType,
      quantity: difference,
      balance_after: nextQuantity,
      reference_type: "product_edit",
      notes: `Quantity edited from ${previousQuantity} to ${nextQuantity}`,
      created_by: request.auth.user.id,
    });

    if (movementError) {
      const rollback = {};
      for (const key of Object.keys(payload)) rollback[key] = previous[key];
      await supabaseAdmin.from("products").update(rollback).eq("id", request.params.id);
      throw new ApiError(400, movementError.message);
    }
  }

  await supabaseAdmin.from("activity_logs").insert({
    user_id: request.auth.user.id,
    action: "product_updated",
    entity_type: "product",
    entity_id: data.id,
    details: {
      previous_quantity: previousQuantity,
      new_quantity: nextQuantity,
    },
  });

  return sendData(response, data, "Product updated");
});

export const deleteProduct = asyncHandler(async (request, response) => {
  const { data, error } = await supabaseAdmin.from("products").update({ is_active: false }).eq("id", request.params.id).select("id").single();
  if (error || !data) throw new ApiError(400, error?.message || "Product delete failed");
  await supabaseAdmin.from("activity_logs").insert({ user_id: request.auth.user.id, action: "product_deleted", entity_type: "product", entity_id: data.id });
  return sendData(response, data, "Product deleted");
});
