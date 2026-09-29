export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const asyncHandler = (handler) => (request, response, next) =>
  Promise.resolve(handler(request, response, next)).catch(next);

export function sendData(response, data, message = "Success", status = 200, meta = undefined) {
  const body = { success: true, message, data };
  if (meta !== undefined) body.meta = meta;
  return response.status(status).json(body);
}

export function requireResult({ data, error }, message = "Database operation failed.") {
  if (error) throw new ApiError(400, error.message || message, error);
  return data;
}
