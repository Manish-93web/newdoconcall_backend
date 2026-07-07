const ConsultationSession = require("../models/ConsultationSession");
const { CONSULTATION_STATES } = require("../config/constants");
const { createLogger } = require("../utils/logger");

const log = createLogger("jobs:missedCallTimeout");

const RING_TIMEOUT_MS = 60 * 1000;
const timers = new Map(); // sessionId -> Timeout

/**
 * If a call stays in "ringing" for RING_TIMEOUT_MS without the callee joining, mark it
 * missed. Single-process in-memory timer — fine for a single backend instance; a
 * horizontally-scaled deployment would need this moved to a shared/distributed job queue.
 */
function scheduleMissedCallCheck(sessionId, io) {
  cancelMissedCallCheck(sessionId);

  const timer = setTimeout(async () => {
    timers.delete(sessionId.toString());
    try {
      const session = await ConsultationSession.findById(sessionId);
      if (!session || session.state !== CONSULTATION_STATES.RINGING) return;

      session.state = CONSULTATION_STATES.MISSED;
      session.endedAt = new Date();
      session.endReason = "no_answer";
      await session.save();

      io.to(`consult:${session.sessionRoomId}`).emit("consult:state-changed", {
        sessionId: session._id,
        state: session.state,
      });
      log.info(`Session ${sessionId} marked missed after ${RING_TIMEOUT_MS}ms of ringing`);
    } catch (err) {
      log.error("Missed-call check failed", err.message);
    }
  }, RING_TIMEOUT_MS);

  timers.set(sessionId.toString(), timer);
}

function cancelMissedCallCheck(sessionId) {
  const existing = timers.get(sessionId.toString());
  if (existing) {
    clearTimeout(existing);
    timers.delete(sessionId.toString());
  }
}

module.exports = { scheduleMissedCallCheck, cancelMissedCallCheck };
