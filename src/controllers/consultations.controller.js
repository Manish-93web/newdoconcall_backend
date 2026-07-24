const { v4: uuid } = require("uuid");
const ConsultationSession = require("../models/ConsultationSession");
const Appointment = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");
const { notify } = require("../services/notification/notification.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { CONSULTATION_STATES, ROLES, NOTIFICATION_CHANNELS } = require("../config/constants");
const { getIceServers } = require("../services/webrtc/iceServers.service");

// Full-mesh WebRTC cost is N-1 PeerConnections per device — fine at this cap (see
// signaling.socket.js), impractical much beyond it without an SFU.
const MAX_CONSULT_PARTICIPANTS = 6;

async function loadAppointmentForParticipant(appointmentId, user) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");

  const doctorProfile = await DoctorProfile.findById(appointment.doctor).select("user");
  const isPatient = appointment.patient.toString() === user.id;
  const isDoctor = doctorProfile && doctorProfile.user.toString() === user.id;
  if (!isPatient && !isDoctor && user.role !== ROLES.PLATFORM_ADMIN) {
    throw new ApiError(403, "FORBIDDEN", "You are not part of this appointment");
  }
  return { appointment, isPatient, isDoctor };
}

// Falls back from the strict appointment-based check (treating doctor/patient/admin) to
// checking session.participants directly — lets an invited specialist (who is neither
// appointment.patient nor the DoctorProfile.user of appointment.doctor) reach
// session-scoped routes once they've accepted an invite and been added as a participant.
async function loadSessionForAnyParticipant(session, user) {
  const appointmentId = session.appointment?._id || session.appointment;
  try {
    await loadAppointmentForParticipant(appointmentId, user);
  } catch (err) {
    const isParticipant = session.participants.some((p) => p.user.toString() === user.id);
    if (!isParticipant) throw err;
  }
}

const start = asyncHandler(async (req, res) => {
  const { appointment, isPatient, isDoctor } = await loadAppointmentForParticipant(
    req.params.appointmentId,
    req.user
  );

  if (appointment.mode === "in_clinic") {
    throw new ApiError(400, "NOT_A_TELECONSULT", "This appointment is not a video/voice/chat consultation");
  }
  if (!["confirmed", "completed"].includes(appointment.status)) {
    throw new ApiError(400, "APPOINTMENT_NOT_CONFIRMED", "Appointment must be confirmed before starting a consult");
  }

  let session = await ConsultationSession.findOne({
    appointment: appointment._id,
    state: { $ne: CONSULTATION_STATES.ENDED },
  });

  if (!session) {
    session = await ConsultationSession.create({
      appointment: appointment._id,
      sessionRoomId: uuid(),
      mode: appointment.mode,
      state: CONSULTATION_STATES.SCHEDULED,
      participants: [
        { user: appointment.patient, role: "patient" },
        { user: (await DoctorProfile.findById(appointment.doctor)).user, role: "doctor" },
      ],
    });
    return created(res, session, "Consultation session created");
  }

  return ok(res, session, "Resuming existing consultation session");
});

const iceServers = asyncHandler(async (req, res) => {
  return ok(res, getIceServers(req.user.id));
});

const getOne = asyncHandler(async (req, res) => {
  const session = await ConsultationSession.findById(req.params.id)
    .populate("appointment")
    .populate("participants.user", "name");
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");
  await loadSessionForAnyParticipant(session, req.user);

  // Same private-message filtering as getChatHistory — both useConsultCall hooks fetch
  // their initial chatTranscript from this endpoint, not getChatHistory, so it needs the
  // same guarantee that a targeted message never reaches anyone but its two parties.
  const payload = session.toObject();
  payload.chatTranscript = payload.chatTranscript.filter(
    (entry) => !entry.to || entry.to.toString() === req.user.id || entry.sender.toString() === req.user.id
  );
  return ok(res, payload);
});

const getChatHistory = asyncHandler(async (req, res) => {
  const session = await ConsultationSession.findById(req.params.id).select("appointment participants chatTranscript");
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");
  await loadSessionForAnyParticipant(session, req.user);

  // Private (targeted) messages are only visible to their sender and recipient — everyone
  // else's history fetch filters them out entirely, not just hides them client-side.
  const visible = session.chatTranscript.filter(
    (entry) => !entry.to || entry.to.toString() === req.user.id || entry.sender.toString() === req.user.id
  );
  return ok(res, visible);
});

const shareFile = asyncHandler(async (req, res) => {
  const { fileId } = req.body;
  if (!fileId) throw new ApiError(400, "FILE_ID_REQUIRED", "fileId is required");

  const session = await ConsultationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");
  await loadSessionForAnyParticipant(session, req.user);

  session.sharedFiles.push({ uploadedBy: req.user.id, fileRef: fileId });
  await session.save();

  return ok(res, session.sharedFiles, "File shared");
});

const end = asyncHandler(async (req, res) => {
  const session = await ConsultationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");
  await loadSessionForAnyParticipant(session, req.user);

  // Mirrors signaling.socket.js's consult:end guard — an invited specialist hanging up must
  // not terminate the doctor's and patient's session too; their client already left via
  // consult:leave, so this call is a no-op for them rather than an error.
  const participant = session.participants.find((p) => p.user.toString() === req.user.id);
  if (participant?.role === "specialist") {
    return ok(res, session, "Left consultation");
  }

  session.state = CONSULTATION_STATES.ENDED;
  session.endedAt = new Date();
  session.endReason = req.body.reason || "ended_by_participant";
  if (session.startedAt) {
    session.durationSeconds = Math.round((session.endedAt - session.startedAt) / 1000);
  }
  await session.save();

  return ok(res, session, "Consultation ended");
});

// Treating-doctor-only: invites another verified doctor into an in-progress consultation
// for a second opinion. The specialist doesn't join the room until they accept below —
// this only creates the pending invite + notifies them.
const invite = asyncHandler(async (req, res) => {
  const { doctorProfileId } = req.body;
  if (!doctorProfileId) throw new ApiError(400, "DOCTOR_REQUIRED", "doctorProfileId is required");

  const session = await ConsultationSession.findById(req.params.id).populate("appointment");
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");
  if (session.state === CONSULTATION_STATES.ENDED) {
    throw new ApiError(400, "SESSION_ENDED", "Cannot invite into an ended session");
  }

  const { isDoctor } = await loadAppointmentForParticipant(session.appointment._id, req.user);
  if (!isDoctor) throw new ApiError(403, "FORBIDDEN", "Only the treating doctor can invite another doctor");

  if (session.locked) {
    throw new ApiError(409, "SESSION_LOCKED", "This consultation is locked to new participants");
  }
  if (session.participants.length + session.pendingInvites.length >= MAX_CONSULT_PARTICIPANTS) {
    throw new ApiError(409, "SESSION_FULL", "This consultation has reached its participant limit");
  }

  const invitedDoctor = await DoctorProfile.findById(doctorProfileId).select("user");
  if (!invitedDoctor) throw new ApiError(404, "NOT_FOUND", "Doctor not found");

  const alreadyIn =
    session.participants.some((p) => p.user.toString() === invitedDoctor.user.toString()) ||
    session.pendingInvites.some((p) => p.user.toString() === invitedDoctor.user.toString());
  if (alreadyIn) throw new ApiError(409, "ALREADY_INVITED", "This doctor is already part of this consultation");

  session.pendingInvites.push({ user: invitedDoctor.user, invitedBy: req.user.id, invitedAt: new Date() });
  await session.save();

  await notify({
    userId: invitedDoctor.user,
    channel: NOTIFICATION_CHANNELS.PUSH,
    type: "consult_invite",
    title: "You're invited to a consultation",
    body: "A doctor has invited you to join an ongoing consultation for a second opinion.",
    data: { sessionId: session._id.toString() },
  });

  return ok(res, session, "Invite sent");
});

// Host-only toggle blocking new invites (existing participants can always rejoin) —
// see the model comment on ConsultationSession.locked.
const setLock = asyncHandler(async (req, res) => {
  const { locked } = req.body;
  const session = await ConsultationSession.findById(req.params.id).populate("appointment");
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");

  const { isDoctor } = await loadAppointmentForParticipant(session.appointment._id, req.user);
  if (!isDoctor) throw new ApiError(403, "FORBIDDEN", "Only the treating doctor can lock this consultation");

  session.locked = !!locked;
  await session.save();
  return ok(res, session, session.locked ? "Consultation locked" : "Consultation unlocked");
});

// Doctors this session has an open invite for — lets a client show a list/badge rather
// than relying solely on catching a live push notification.
const listMyInvites = asyncHandler(async (req, res) => {
  const sessions = await ConsultationSession.find({
    "pendingInvites.user": req.user.id,
    state: { $ne: CONSULTATION_STATES.ENDED },
  })
    .select("appointment mode state pendingInvites")
    .populate("appointment");
  return ok(res, sessions);
});

const acceptInvite = asyncHandler(async (req, res) => {
  const session = await ConsultationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");

  const inviteIndex = session.pendingInvites.findIndex((p) => p.user.toString() === req.user.id);
  if (inviteIndex === -1) throw new ApiError(404, "NOT_FOUND", "No pending invite for you on this session");

  session.pendingInvites.splice(inviteIndex, 1);
  session.participants.push({ user: req.user.id, role: "specialist" });
  await session.save();

  return ok(res, session, "Joined consultation");
});

const declineInvite = asyncHandler(async (req, res) => {
  const session = await ConsultationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");

  const inviteIndex = session.pendingInvites.findIndex((p) => p.user.toString() === req.user.id);
  if (inviteIndex === -1) throw new ApiError(404, "NOT_FOUND", "No pending invite for you on this session");

  session.pendingInvites.splice(inviteIndex, 1);
  await session.save();

  return ok(res, null, "Invite declined");
});

module.exports = {
  start,
  getOne,
  getChatHistory,
  shareFile,
  end,
  iceServers,
  invite,
  listMyInvites,
  acceptInvite,
  declineInvite,
  setLock,
};
