import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";

export const listNotifications = asyncHandler(async (request, response) => {
  const limit = Math.min(
    200,
    Math.max(1, Number(request.query.limit || 50))
  );

  let query = supabaseAdmin
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (String(request.query.unread) === "true") {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(400, error.message);
  }

  const { count } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  return sendData(
    response,
    data || [],
    "Notifications loaded",
    200,
    { unread: count || 0 }
  );
});

export const markRead = asyncHandler(async (request, response) => {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("id", request.params.id)
    .select()
    .single();

  if (error) {
    throw new ApiError(400, error.message);
  }

  return sendData(response, data, "Notification read");
});

export const markAllRead = asyncHandler(async (request, response) => {
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("is_read", false);

  if (error) {
    throw new ApiError(400, error.message);
  }

  return sendData(response, true, "All notifications read");
});

export const deleteNotification = asyncHandler(
  async (request, response) => {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("id", request.params.id)
      .select("id")
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    return sendData(response, data, "Notification deleted");
  }
);