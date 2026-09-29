import { env } from "../config/env.js";
import { assertDatabase, supabaseAdmin, supabaseAuth } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";

export const login = asyncHandler(async (request, response) => {
  assertDatabase();
  const identifier = String(request.body.identifier || "").trim();
  const password = String(request.body.password || "");
  if (!identifier || !password) throw new ApiError(400, "Username/Email او Password ضروري دي.");

  let email = identifier;
  if (!identifier.includes("@")) {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("email,is_active")
      .eq("username", identifier)
      .maybeSingle();
    if (error || !profile) throw new ApiError(401, "Username یا Password ناسم دی.");
    if (!profile.is_active) throw new ApiError(403, "User account غیر فعال دی.");
    email = profile.email;
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new ApiError(401, "Username یا Password ناسم دی.");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();
  if (profileError || !profile) throw new ApiError(403, "Profile پیدا نه شو.");

  await supabaseAdmin.from("activity_logs").insert({
    user_id: profile.id,
    action: "login",
    entity_type: "auth",
    details: { ip: request.ip, user_agent: request.headers["user-agent"] },
  });

  return sendData(response, { session: data.session, profile }, "Login successful");
});


export const refreshSession = asyncHandler(async (request, response) => {
  assertDatabase();
  const refreshToken = String(request.body.refresh_token || "");
  if (!refreshToken) throw new ApiError(400, "Refresh token ضروري دی.");
  const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw new ApiError(401, "Session پای ته رسېدلې. بیا Login وکړئ.");
  return sendData(response, { session: data.session }, "Session refreshed");
});

export const me = asyncHandler(async (request, response) => sendData(response, request.auth.profile));

export const logout = asyncHandler(async (request, response) => {
  if (request.auth?.profile?.id) {
    await supabaseAdmin.from("activity_logs").insert({ user_id: request.auth.profile.id, action: "logout", entity_type: "auth" });
  }
  return sendData(response, true, "Logged out");
});

export const forgotPassword = asyncHandler(async (request, response) => {
  assertDatabase();
  const email = String(request.body.email || "").trim();
  if (!email) throw new ApiError(400, "Email ضروري دی.");
  const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, { redirectTo: env.passwordResetRedirect });
  if (error) throw new ApiError(400, error.message);
  return sendData(response, true, "Password reset email sent");
});

export const changePassword = asyncHandler(async (request, response) => {
  const password = String(request.body.password || "");
  if (password.length < 8) throw new ApiError(400, "Password باید لږ تر لږه 8 توري وي.");
  const { error } = await supabaseAdmin.auth.admin.updateUserById(request.auth.user.id, { password });
  if (error) throw new ApiError(400, error.message);
  await supabaseAdmin.from("activity_logs").insert({ user_id: request.auth.user.id, action: "password_changed", entity_type: "auth" });
  return sendData(response, true, "Password changed");
});
