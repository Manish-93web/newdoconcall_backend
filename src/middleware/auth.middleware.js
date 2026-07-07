const { verifyAccessToken } = require("../services/auth/jwt.service");
const { ApiError } = require("../utils/apiResponse");
const User = require("../models/User");

function authenticate(options = {}) {
  const { optional = false } = options;

  return async function authMiddleware(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      if (optional) return next();
      return next(new ApiError(401, "UNAUTHENTICATED", "Missing bearer token"));
    }

    try {
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).select("role status name email phone");
      if (!user) throw new Error("User not found");
      if (user.status === "suspended") {
        return next(new ApiError(403, "ACCOUNT_SUSPENDED", "This account has been suspended"));
      }
      req.user = { id: user._id.toString(), role: user.role, doc: user };
      return next();
    } catch (err) {
      if (optional) return next();
      return next(new ApiError(401, "INVALID_TOKEN", "Invalid or expired access token"));
    }
  };
}

module.exports = { authenticate };
