const { ApiError } = require("../utils/apiResponse");
const { ROLES } = require("../config/constants");

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

// Additional gate for admin.routes.js, layered on top of allowRoles(PLATFORM_ADMIN)
// there. A platform_admin with no adminCapabilities array set is a full admin (the
// classic, pre-RBAC account shape) and passes every capability check unconditionally —
// restriction only applies once an array has been explicitly assigned via the sub-admin
// creation/edit flow (admin.controller.js), even if that array is empty.
function requireCapability(capability) {
  return function capabilityMiddleware(req, res, next) {
    if (!req.user) {
      return next(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
    }
    if (req.user.role !== ROLES.PLATFORM_ADMIN) return next();

    const capabilities = req.user.doc?.adminCapabilities;
    if (!capabilities) return next();
    if (!capabilities.includes(capability)) {
      return next(new ApiError(403, "MISSING_CAPABILITY", `This action requires the "${capability}" capability`));
    }
    return next();
  };
}

// Prevents privilege escalation: creating a new admin account or editing another admin's
// capabilities stays restricted to already-full admins — otherwise a sub-admin scoped to
// e.g. manage_users could grant themselves (or a new account) broader access than they
// were scoped to, defeating the entire point of the capability model above.
function requireFullAdmin(req, res, next) {
  if (!req.user) {
    return next(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
  }
  if (req.user.role !== ROLES.PLATFORM_ADMIN || req.user.doc?.adminCapabilities) {
    return next(new ApiError(403, "FORBIDDEN", "Only a full admin can perform this action"));
  }
  return next();
}

module.exports = { allowRoles, requireCapability, requireFullAdmin };
