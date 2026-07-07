const { ApiError, fail } = require("../utils/apiResponse");
const { createLogger } = require("../utils/logger");

const log = createLogger("errorHandler");

function notFoundHandler(req, res) {
  return fail(res, 404, "NOT_FOUND", `Route not found: ${req.method} ${req.originalUrl}`);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }

  if (err.name === "ValidationError") {
    return fail(res, 400, "VALIDATION_ERROR", err.message);
  }

  if (err.name === "CastError") {
    return fail(res, 400, "INVALID_ID", `Invalid identifier: ${err.value}`);
  }

  if (err.code === 11000) {
    return fail(res, 409, "DUPLICATE_KEY", "A record with these details already exists", err.keyValue);
  }

  log.error(err.message, err.stack);
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong");
}

module.exports = { notFoundHandler, errorHandler };
