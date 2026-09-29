import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";

const clean = (body = {}) => ({
  name: String(body.name || "").trim(),
  location: String(body.location || "").trim() || null,
  description: String(body.description || "").trim() || null,
  status: body.status === "Inactive" ? "Inactive" : "Active",
});

export const listWarehouses = asyncHandler(async (request, response) => {
  const q = String(request.query.search || "").trim();
  let query = supabaseAdmin.from("warehouses").select("*").eq("is_active", true).order("is_primary", { ascending: false }).order("created_at", { ascending: true });
  if (q) query = query.or(`name.ilike.%${q}%,location.ilike.%${q}%,description.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data || [], "Warehouses loaded", 200, { total: data?.length || 0 });
});

export const createWarehouse = asyncHandler(async (request, response) => {
  const payload = clean(request.body);
  if (!payload.name) throw new ApiError(400, "د ګودام نوم ضروري دی.");
  const { data, error } = await supabaseAdmin.from("warehouses").insert({ ...payload, created_by: request.auth.user.id }).select().single();
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data, "Warehouse created", 201);
});

export const updateWarehouse = asyncHandler(async (request, response) => {
  const payload = clean(request.body);
  if (!payload.name) delete payload.name;
  const { data, error } = await supabaseAdmin.from("warehouses").update(payload).eq("id", request.params.id).select().single();
  if (error || !data) throw new ApiError(400, error?.message || "Warehouse update failed");
  return sendData(response, data, "Warehouse updated");
});

export const deleteWarehouse = asyncHandler(async (request, response) => {
  const { data: row, error: findError } = await supabaseAdmin.from("warehouses").select("*").eq("id", request.params.id).single();
  if (findError || !row) throw new ApiError(404, "ګودام پیدا نه شو.");
  if (row.is_primary) throw new ApiError(400, "اصلي Main Warehouse نه شي حذف کېدای.");
  await supabaseAdmin.from("recycle_bin").insert({ entity_type: "warehouse", entity_id: row.id, label: row.name, data: row, deleted_by: { id: request.auth.user.id, name: request.auth.profile.full_name } });
  const { data, error } = await supabaseAdmin.from("warehouses").update({ is_active: false }).eq("id", row.id).select("id").single();
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data, "Warehouse deleted");
});
