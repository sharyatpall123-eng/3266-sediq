import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";

const tableByType = {
  warehouse: "warehouses",
  debtor: "customers",
  product: "products",
  representative: "representatives",
};

export const listRecycleBin = asyncHandler(async (request, response) => {
  let query = supabaseAdmin.from("recycle_bin").select("*").order("deleted_at", { ascending: false });
  if (request.query.type && request.query.type !== "all") query = query.eq("entity_type", request.query.type);
  const { data, error } = await query;
  if (error) throw new ApiError(400, error.message);
  const q = String(request.query.search || "").trim().toLowerCase();
  const rows = q ? (data || []).filter((row) => [row.label, row.entity_type, row.deleted_by?.name].some((value) => String(value || "").toLowerCase().includes(q))) : (data || []);
  return sendData(response, rows, "Recycle bin loaded", 200, { total: rows.length });
});

export const restoreRecycleItem = asyncHandler(async (request, response) => {
  const { data: trash, error: findError } = await supabaseAdmin.from("recycle_bin").select("*").eq("id", request.params.id).single();
  if (findError || !trash) throw new ApiError(404, "Recycle Bin ریکارډ پیدا نه شو.");
  const table = tableByType[trash.entity_type];
  if (!table) throw new ApiError(400, "د دې ریکارډ Restore نه ملاتړ کېږي.");
  const row = { ...trash.data };
  if (["warehouse", "debtor", "product", "representative"].includes(trash.entity_type)) row.is_active = true;
  const { error } = await supabaseAdmin.from(table).upsert(row, { onConflict: "id" });
  if (error) throw new ApiError(400, error.message);
  await supabaseAdmin.from("recycle_bin").delete().eq("id", trash.id);
  return sendData(response, { success: true, restored: row, entity_type: trash.entity_type }, "Restored");
});

export const permanentlyDelete = asyncHandler(async (request, response) => {
  const { data, error } = await supabaseAdmin.from("recycle_bin").delete().eq("id", request.params.id).select("id").single();
  if (error) throw new ApiError(400, error.message);
  return sendData(response, { success: true, id: data.id }, "Permanently deleted");
});
