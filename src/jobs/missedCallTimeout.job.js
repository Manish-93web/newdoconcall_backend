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

// The in-memory timers above don't survive a process restart — if the backend restarts
// (deploy, crash, nodemon reload in dev) while a call is mid-ring, that session is
// orphaned in "ringing" forever with no timer left to resolve it, which also permanently
// pins its doctor as "busy" (see doctorAvailability.service.js's getBusyDoctorIds). Run once
// at startup to catch anything that was already stuck before this process existed.
async function sweepStaleRingingSessions() {
  const cutoff = new Date(Date.now() - RING_TIMEOUT_MS);
  const stale = await ConsultationSession.find({ state: CONSULTATION_STATES.RINGING, createdAt: { $lt: cutoff } });
  for (const session of stale) {
    session.state = CONSULTATION_STATES.MISSED;
    session.endedAt = new Date();
    session.endReason = "no_answer";
    await session.save();
  }
  if (stale.length) log.info(`Swept ${stale.length} stale ringing session(s) orphaned by a prior restart`);
}

module.exports = { scheduleMissedCallCheck, cancelMissedCallCheck, sweepStaleRingingSessions, RING_TIMEOUT_MS };
