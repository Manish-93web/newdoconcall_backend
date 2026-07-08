const AuditLog = require("../models/AuditLog");
const { createLogger } = require("./logger");

const log = createLogger("utils:auditLog");

// Best-effort — a failure here must never block the primary admin action it's recording.
async function recordAuditLog(actorUser, action, entityType, entityId, before, after, req) {
  try {
    await AuditLog.create({
      actor: actorUser?.id || actorUser,
      action,
      entityType,
      entityId,
      before,
      after,
      ip: req?.ip,
      userAgent: req?.headers?.["user-agent"],
    });
  } catch (err) {
    log.error("Failed to record audit log", err.message);
  }
}

module.exports = { recordAuditLog };
