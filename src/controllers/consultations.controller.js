const { v4: uuid } = require("uuid");
const ConsultationSession = require("../models/ConsultationSession");
const Appointment = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");
const { ok, created, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { CONSULTATION_STATES, ROLES } = require("../config/constants");
const { getIceServers } = require("../services/webrtc/iceServers.service");

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
  const session = await ConsultationSession.findById(req.params.id).populate("appointment");
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");
  await loadAppointmentForParticipant(session.appointment._id, req.user);
  return ok(res, session);
});

const getChatHistory = asyncHandler(async (req, res) => {
  const session = await ConsultationSession.findById(req.params.id).select("appointment chatTranscript");
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");
  await loadAppointmentForParticipant(session.appointment, req.user);
  return ok(res, session.chatTranscript);
});

const shareFile = asyncHandler(async (req, res) => {
  const { fileId } = req.body;
  if (!fileId) throw new ApiError(400, "FILE_ID_REQUIRED", "fileId is required");

  const session = await ConsultationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");
  await loadAppointmentForParticipant(session.appointment, req.user);

  session.sharedFiles.push({ uploadedBy: req.user.id, fileRef: fileId });
  await session.save();

  return ok(res, session.sharedFiles, "File shared");
});

const end = asyncHandler(async (req, res) => {
  const session = await ConsultationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, "NOT_FOUND", "Consultation session not found");
  await loadAppointmentForParticipant(session.appointment, req.user);

  session.state = CONSULTATION_STATES.ENDED;
  session.endedAt = new Date();
  session.endReason = req.body.reason || "ended_by_participant";
  if (session.startedAt) {
    session.durationSeconds = Math.round((session.endedAt - session.startedAt) / 1000);
  }
  await session.save();

  return ok(res, session, "Consultation ended");
});

module.exports = { start, getOne, getChatHistory, shareFile, end, iceServers };
