export function notFound(request, response) {
  response.status(404).json({ success: false, message: `Route پیدا نه شو: ${request.method} ${request.originalUrl}` });
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);
  const status = Number(error.statusCode || error.status || 500);
  if (process.env.NODE_ENV !== "production") console.error(error);
  return response.status(status).json({
    success: false,
    message: error.message || "Server error",
    ...(error.details && process.env.NODE_ENV !== "production" ? { details: error.details } : {}),
  });
}
