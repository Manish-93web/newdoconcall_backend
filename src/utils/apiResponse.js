function ok(res, data, message = "OK", meta) {
  const body = { success: true, data, message };
  if (meta) body.meta = meta;
  return res.json(body);
}

function created(res, data, message = "Created") {
  return res.status(201).json({ success: true, data, message });
}

function fail(res, status, code, message, details) {
  return res.status(status).json({
    success: false,
    error: { code, message, details: details || undefined },
  });
}

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = { ok, created, fail, ApiError };
