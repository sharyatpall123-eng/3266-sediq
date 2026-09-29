import path from "node:path";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";

async function uploadImage(request, response, bucket) {
  if (!request.file) throw new ApiError(400, "Image file نشته.");
  const extension = path.extname(request.file.originalname).toLowerCase() || ".jpg";
  const objectName = `${request.auth.user.id}/${randomUUID()}${extension}`;
  const { error } = await supabaseAdmin.storage.from(bucket).upload(objectName, request.file.buffer, {
    contentType: request.file.mimetype,
    upsert: false,
  });
  if (error) throw new ApiError(400, error.message);
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(objectName);
  return sendData(response, { path: objectName, url: data.publicUrl }, "Image uploaded", 201);
}

export const uploadProductImage = asyncHandler((request, response) => uploadImage(request, response, "product-images"));
export const uploadCompanyAsset = asyncHandler((request, response) => uploadImage(request, response, "company-assets"));
export const uploadProfileImage = asyncHandler((request, response) => uploadImage(request, response, "company-assets"));
