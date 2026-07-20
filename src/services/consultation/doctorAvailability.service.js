const Appointment = require("../../models/Appointment");
const ConsultationSession = require("../../models/ConsultationSession");
const { APPOINTMENT_STATUSES, CONSULTATION_STATES } = require("../../config/constants");
const { RING_TIMEOUT_MS } = require("../../jobs/missedCallTimeout.job");

const DEFAULT_AVG_CONSULT_MINUTES = 15;
const MIN_ESTIMATE_MINUTES = 2;
const RECENT_SESSIONS_SAMPLE_SIZE = 5;

// Computed live from ConsultationSession on every call, not a separately-stored "busy"
// flag that could get stuck out of sync. Shared by the instant-consult matching flow
// (appointments.controller.js) and the doctor search listing (doctors.controller.js).
async function getActiveSessionsByDoctor(candidateIds) {
  // A "ringing" session older than the ring-timeout window should already have flipped to
  // "missed" (see missedCallTimeout.job.js) — excluding stale ones here is a safety net
  // for the gap between a stuck session existing and the next restart's startup sweep
  // catching it, so one orphaned session can't pin a doctor as busy indefinitely.
  const ringingCutoff = new Date(Date.now() - RING_TIMEOUT_MS);
  const activeSessions = await ConsultationSession.find({
    $or: [
      { state: { $in: [CONSULTATION_STATES.CONNECTED, CONSULTATION_STATES.ON_HOLD] } },
      { state: CONSULTATION_STATES.RINGING, createdAt: { $gte: ringingCutoff } },
    ],
  }).select("appointment startedAt");

  const activeAppointments = await Appointment.find({
    _id: { $in: activeSessions.map((s) => s.appointment) },
    ...(candidateIds ? { doctor: { $in: candidateIds } } : {}),
  }).select("doctor");

  const sessionByAppointmentId = new Map(activeSessions.map((s) => [s.appointment.toString(), s]));
  const byDoctor = new Map();
  for (const appt of activeAppointments) {
    byDoctor.set(appt.doctor.toString(), sessionByAppointmentId.get(appt._id.toString()));
  }
  return byDoctor;
}

async function getBusyDoctorIds(candidateIds) {
  const byDoctor = await getActiveSessionsByDoctor(candidateIds);
  return new Set(byDoctor.keys());
}

// A clearly-labeled ESTIMATE, never a promise: for each busy doctor, that doctor's own
// average recent consult length minus how long their current call has already run,
// floored at a small minimum so "almost done" doesn't read as instantly free. Falls back
// to a platform-wide default for doctors with no completed-session history yet. Returns
// a Map<doctorId, minutes> containing only doctors who are currently busy — callers
// should treat an available-and-idle doctor as a 0-minute wait, not present in this map.
async function getEstimatedWaitMinutes(candidateIds) {
  const activeByDoctor = await getActiveSessionsByDoctor(candidateIds);
  const result = new Map();
  if (!activeByDoctor.size) return result;

  await Promise.all(
    [...activeByDoctor.entries()].map(async ([doctorId, session]) => {
      const recentAppointments = await Appointment.find({
        doctor: doctorId,
        status: APPOINTMENT_STATUSES.COMPLETED,
      })
        .sort({ scheduledStart: -1 })
        .limit(RECENT_SESSIONS_SAMPLE_SIZE)
        .select("_id");

      const recentSessions = await ConsultationSession.find({
        appointment: { $in: recentAppointments.map((a) => a._id) },
        durationSeconds: { $gt: 0 },
      }).select("durationSeconds");

      const avgMinutes = recentSessions.length
        ? recentSessions.reduce((sum, s) => sum + s.durationSeconds, 0) / recentSessions.length / 60
        : DEFAULT_AVG_CONSULT_MINUTES;

      const elapsedMinutes = session?.startedAt ? (Date.now() - session.startedAt.getTime()) / 60000 : 0;
      result.set(doctorId, Math.max(MIN_ESTIMATE_MINUTES, Math.round(avgMinutes - elapsedMinutes)));
    })
  );

  return result;
}

module.exports = { getBusyDoctorIds, getEstimatedWaitMinutes };
