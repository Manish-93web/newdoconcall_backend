const { ApiError } = require("../utils/apiResponse");

function allowRoles(...roles) {
  return function rbacMiddleware(req, res, next) {
    if (!req.user) {
      return next(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "FORBIDDEN", "You do not have access to this resource"));
    }
    return next();
  };
}

module.exports = { allowRoles };
