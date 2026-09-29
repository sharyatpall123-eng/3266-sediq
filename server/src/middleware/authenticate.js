import { assertDatabase, supabaseAdmin, supabaseAuth } from "../config/supabase.js";
import { ApiError, asyncHandler } from "../utils/http.js";

export const authenticate = asyncHandler(async (request, response, next) => {
  assertDatabase();
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new ApiError(401, "Authentication token نشته.");

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) throw new ApiError(401, "Session ختم یا ناسم دی.");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile || !profile.is_active) throw new ApiError(403, "User account فعال نه دی.");

  request.auth = { token, user: data.user, profile };
  next();
});

export const authorize = (...roles) => (request, response, next) => {
  if (!request.auth?.profile) return next(new ApiError(401, "Authentication required."));
  if (!roles.length || roles.includes(request.auth.profile.role)) return next();
  return next(new ApiError(403, "د دې عملیاتو اجازه نه لرئ."));
};


export const permit = (permission, ...legacyRoles) => (request, response, next) => {
  const profile = request.auth?.profile;
  if (!profile) return next(new ApiError(401, "Authentication required."));
  if (profile.role === "administrator") return next();
  const explicit = Array.isArray(profile.permissions) ? profile.permissions : [];
  if (profile.permissions_mode === "custom" || explicit.length) {
    if (explicit.includes("*") || explicit.includes(permission)) return next();
    return next(new ApiError(403, "د دې عملیاتو Permission نه لرئ."));
  }
  if (legacyRoles.includes(profile.role)) return next();
  return next(new ApiError(403, "د دې عملیاتو اجازه نه لرئ."));
};
