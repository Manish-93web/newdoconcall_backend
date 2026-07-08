const rateLimit = require("express-rate-limit");
const { ApiError } = require("../utils/apiResponse");

function limiterErrorHandler(req, res, next, options) {
  next(new ApiError(429, "TOO_MANY_REQUESTS", "Too many attempts. Please try again later."));
}

// Applied per-IP to the auth endpoints most exposed to credential-stuffing / OTP-spam,
// since request-frequency wasn't throttled anywhere before this (only OTP *verification*
// attempts were capped, not how often a code/login could be requested).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
});

module.exports = { authLimiter, otpLimiter };
