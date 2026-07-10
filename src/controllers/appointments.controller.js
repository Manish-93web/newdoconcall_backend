const Appointment = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");
const ConsultationSession = require("../models/ConsultationSession");
const PatientSubscription = require("../models/PatientSubscription");
const User = require("../models/User");
const HealthRecord = require("../models/HealthRecord");
const Prescription = require("../models/Prescription");
const PlatformSetting = require("../models/PlatformSetting");
const { computeSplit } = require("../services/commission/commission.service");
const { notify } = require("../services/notification/notification.service");
const { RING_TIMEOUT_MS } = require("../jobs/missedCallTimeout.job");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const {
  APPOINTMENT_STATUSES,
  NOTIFICATION_CHANNELS,
  ROLES,
  CONSULTATION_STATES,
} = require("../config/constants");

const POPULATE = [
  { path: "doctor", populate: { path: "user", select: "name" } },
  { path: "clinic", select: "name address" },
  { path: "patient", select: "name phone" },
  { path: "forFamilyMember", select: "name relation" },
];

async function assertParticipant(appointment, user) {
  const doctorProfile = await DoctorProfile.findById(appointment.doctor).select("user");
  const isPatient = appointment.patient.toString() === user.id;
  const isDoctor = doctorProfile && doctorProfile.user.toString() === user.id;
  const isAdmin = user.role === ROLES.PLATFORM_ADMIN;
  if (!isPatient && !isDoctor && !isAdmin) {
    throw new ApiError(403, "FORBIDDEN", "You are not part of this appointment");
  }
  return { isPatient, isDoctor, isAdmin, doctorProfile };
}

const book = asyncHandler(async (req, res) => {
  const { doctorId, clinicId, forFamilyMemberId, mode, scheduledStart, scheduledEnd, bookingType, parentAppointmentId } =
    req.body;

  const doctor = await DoctorProfile.findById(doctorId);
  if (!doctor) throw new ApiError(404, "DOCTOR_NOT_FOUND", "Doctor not found");

  const conflict = await Appointment.findOne({
    doctor: doctorId,
    scheduledStart: new Date(scheduledStart),
    status: { $nin: [APPOINTMENT_STATUSES.CANCELLED] },
  });
  if (conflict) throw new ApiError(409, "SLOT_TAKEN", "This slot is no longer available");

  // A free follow-up must reference a completed appointment, with the same doctor and
  // patient, still inside its 7-day follow-up window — checked server-side so the fee
  // waiver can't be requested for an arbitrary/expired/someone-else's appointment.
  let isFreeFollowUp = false;
  if (parentAppointmentId) {
    const parent = await Appointment.findById(parentAppointmentId);
    if (
      parent &&
      parent.patient.toString() === req.user.id &&
      parent.doctor.toString() === doctorId &&
      parent.status === APPOINTMENT_STATUSES.COMPLETED &&
      parent.followUpWindowEndsAt &&
      parent.followUpWindowEndsAt > new Date()
    ) {
      isFreeFollowUp = true;
    } else {
      throw new ApiError(400, "FOLLOW_UP_NOT_ELIGIBLE", "This appointment is not eligible for a free follow-up");
    }
  }

  const amount = isFreeFollowUp ? 0 : doctor.consultationFee[mode === "in_clinic" ? "inClinic" : mode] || 0;
  const { commissionAmount, netToProvider } = isFreeFollowUp
    ? { commissionAmount: 0, netToProvider: 0 }
    : await computeSplit("appointment", amount);

  const appointment = await Appointment.create({
    patient: req.user.id,
    forFamilyMember: forFamilyMemberId || null,
    doctor: doctorId,
    clinic: clinicId || null,
    mode,
    scheduledStart,
    scheduledEnd,
    bookingType,
    fee: { amount, commissionAmount, doctorPayoutAmount: netToProvider },
    status: amount > 0 ? APPOINTMENT_STATUSES.PENDING_PAYMENT : APPOINTMENT_STATUSES.CONFIRMED,
    parentAppointment: parentAppointmentId || null,
  });

  await notify({
    userId: doctor.user,
    channel: NOTIFICATION_CHANNELS.IN_APP,
    type: "appointment_booked",
    title: "New appointment booked",
    body: `A patient booked a ${mode} appointment on ${new Date(scheduledStart).toLocaleString()}`,
    data: { appointmentId: appointment._id, mode, when: new Date(scheduledStart).toLocaleString() },
  });

  return created(res, appointment, "Appointment booked");
});

// Computed live from ConsultationSession on every call, not a separately-stored "busy"
// flag that could get stuck out of sync. Shared by the auto-match path below and by
// bookInstant's explicit-doctorId path (a patient picking a specific doctor off the list).
async function getBusyDoctorIds(candidateIds) {
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
  }).select("appointment");
  const activeAppointments = await Appointment.find({
    _id: { $in: activeSessions.map((s) => s.appointment) },
    ...(candidateIds ? { doctor: { $in: candidateIds } } : {}),
  }).select("doctor");
  return new Set(activeAppointments.map((a) => a.doctor.toString()));
}

// Ranks doctors for the "Speak to Doctor Now" instant-match flow: (1) must be manually
// toggled available and not currently in an active call, (2) prior-treating-doctor for
// this patient sorts first, (3) then highest rating. No numeric "wait time" is fabricated
// — availability is reduced to available/busy/offline.
async function findBestAvailableDoctor(specializationId, patientId) {
  const candidates = await DoctorProfile.find({
    specializations: specializationId,
    "verification.status": "verified",
    isListed: true,
    "liveStatus.state": "available",
  }).select("_id user ratingAvg consultationFee");

  if (!candidates.length) return null;

  const busyDoctorIds = await getBusyDoctorIds(candidates.map((d) => d._id));

  const idleCandidates = candidates.filter((d) => !busyDoctorIds.has(d._id.toString()));
  if (!idleCandidates.length) return null;

  const priorAppointments = await Appointment.find({
    patient: patientId,
    status: APPOINTMENT_STATUSES.COMPLETED,
    doctor: { $in: idleCandidates.map((d) => d._id) },
  }).select("doctor");
  const priorDoctorIds = new Set(priorAppointments.map((a) => a.doctor.toString()));

  idleCandidates.sort((a, b) => {
    const aPrior = priorDoctorIds.has(a._id.toString()) ? 1 : 0;
    const bPrior = priorDoctorIds.has(b._id.toString()) ? 1 : 0;
    if (aPrior !== bPrior) return bPrior - aPrior;
    return (b.ratingAvg || 0) - (a.ratingAvg || 0);
  });

  return idleCandidates[0];
}

const bookInstant = asyncHandler(async (req, res) => {
  const { specializationId, mode, doctorId } = req.body;
  if (!specializationId || !mode) {
    throw new ApiError(400, "MISSING_FIELDS", "specializationId and mode are required");
  }
  if (mode === "in_clinic") {
    throw new ApiError(400, "INVALID_MODE", "Instant consult only supports video, voice, or chat");
  }

  let doctor;
  if (doctorId) {
    // Patient picked a specific doctor off the "who's available now" list — re-validate
    // server-side rather than trusting the client's view, since availability can change
    // in the seconds between loading that list and tapping Connect.
    doctor = await DoctorProfile.findOne({
      _id: doctorId,
      specializations: specializationId,
      "verification.status": "verified",
      isListed: true,
      "liveStatus.state": "available",
    }).select("_id user ratingAvg consultationFee");
    if (!doctor) {
      throw new ApiError(404, "DOCTOR_NOT_FOUND", "This doctor isn't available right now — please pick another");
    }
    const busyDoctorIds = await getBusyDoctorIds([doctor._id]);
    if (busyDoctorIds.has(doctor._id.toString())) {
      throw new ApiError(409, "DOCTOR_BUSY", "This doctor just became busy — please pick another");
    }
  } else {
    doctor = await findBestAvailableDoctor(specializationId, req.user.id);
  }
  if (!doctor) throw new ApiError(404, "NO_DOCTOR_AVAILABLE", "No doctor is available for this specialty right now");

  const subscription = await PatientSubscription.findOne({
    user: req.user.id,
    status: "active",
    sessionsRemaining: { $gt: 0 },
  }).sort({ createdAt: -1 });

  const scheduledStart = new Date();
  const scheduledEnd = new Date(scheduledStart.getTime() + 30 * 60 * 1000);

  let appointment;
  if (subscription) {
    // Funded by a session credit — confirmed immediately, deducted on completion (not
    // here), so a session isn't wasted if the doctor never actually joins.
    appointment = await Appointment.create({
      patient: req.user.id,
      doctor: doctor._id,
      mode,
      scheduledStart,
      scheduledEnd,
      bookingType: "instant",
      fee: { amount: 0, commissionAmount: 0, doctorPayoutAmount: 0 },
      status: APPOINTMENT_STATUSES.CONFIRMED,
      sessionSource: subscription._id,
    });
  } else {
    // No session credit available — instant consult is additive, not paywalled behind a
    // subscription; falls through to the same pay-per-visit flow scheduled bookings use.
    const amount = doctor.consultationFee[mode] || 0;
    const { commissionAmount, netToProvider } = await computeSplit("appointment", amount);
    appointment = await Appointment.create({
      patient: req.user.id,
      doctor: doctor._id,
      mode,
      scheduledStart,
      scheduledEnd,
      bookingType: "instant",
      fee: { amount, commissionAmount, doctorPayoutAmount: netToProvider },
      status: amount > 0 ? APPOINTMENT_STATUSES.PENDING_PAYMENT : APPOINTMENT_STATUSES.CONFIRMED,
    });
  }

  await notify({
    userId: doctor.user,
    channel: NOTIFICATION_CHANNELS.IN_APP,
    type: "instant_consult_matched",
    title: "Instant consult request",
    body: "A patient wants to speak with you now.",
    data: { appointmentId: appointment._id },
  });

  return created(res, appointment, "Matched with an available doctor");
});

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, clinicId } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = {};
  if (clinicId && [ROLES.CLINIC_ADMIN, ROLES.CLINIC_STAFF, ROLES.PLATFORM_ADMIN].includes(req.user.role)) {
    if (req.user.role !== ROLES.PLATFORM_ADMIN) {
      const ClinicProfile = require("../models/ClinicProfile");
      const clinic = await ClinicProfile.findById(clinicId).select("owner staff");
      const isOwnerOrStaff =
        clinic &&
        (clinic.owner.toString() === req.user.id || clinic.staff.some((s) => s.toString() === req.user.id));
      if (!isOwnerOrStaff) throw new ApiError(403, "FORBIDDEN", "You do not manage this clinic");
    }
    query.clinic = clinicId;
  } else if (req.user.role === ROLES.DOCTOR) {
    const doctor = await DoctorProfile.findOne({ user: req.user.id }).select("_id");
    query.doctor = doctor?._id;
  } else if (req.user.role === ROLES.PATIENT) {
    query.patient = req.user.id;
  }
  if (status) query.status = status;

  const [appointments, total] = await Promise.all([
    Appointment.find(query).populate(POPULATE).sort({ scheduledStart: -1 }).skip(skip).limit(Number(limit)),
    Appointment.countDocuments(query),
  ]);

  return ok(res, appointments, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const getOne = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id).populate(POPULATE);
  if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
  await assertParticipant(appointment, req.user);
  return ok(res, appointment);
});

const reschedule = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
  await assertParticipant(appointment, req.user);

  const conflict = await Appointment.findOne({
    _id: { $ne: appointment._id },
    doctor: appointment.doctor,
    scheduledStart: new Date(req.body.scheduledStart),
    status: { $nin: [APPOINTMENT_STATUSES.CANCELLED] },
  });
  if (conflict) throw new ApiError(409, "SLOT_TAKEN", "This slot is no longer available");

  appointment.scheduledStart = req.body.scheduledStart;
  appointment.scheduledEnd = req.body.scheduledEnd;
  await appointment.save();

  return ok(res, appointment, "Appointment rescheduled");
});

const cancel = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
  await assertParticipant(appointment, req.user);

  appointment.status = APPOINTMENT_STATUSES.CANCELLED;
  appointment.cancellation = { cancelledBy: req.user.id, reason: req.body.reason, cancelledAt: new Date() };
  await appointment.save();

  return ok(res, appointment, "Appointment cancelled");
});

const accept = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
  const { isDoctor, isAdmin } = await assertParticipant(appointment, req.user);
  if (!isDoctor && !isAdmin) throw new ApiError(403, "FORBIDDEN", "Only the doctor can accept");

  appointment.status = APPOINTMENT_STATUSES.CONFIRMED;
  await appointment.save();
  return ok(res, appointment, "Appointment accepted");
});

const reject = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
  const { isDoctor, isAdmin } = await assertParticipant(appointment, req.user);
  if (!isDoctor && !isAdmin) throw new ApiError(403, "FORBIDDEN", "Only the doctor can reject");

  appointment.status = APPOINTMENT_STATUSES.CANCELLED;
  appointment.cancellation = { cancelledBy: req.user.id, reason: req.body.reason, cancelledAt: new Date() };
  await appointment.save();
  return ok(res, appointment, "Appointment rejected");
});

const complete = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
  const { isDoctor, isAdmin } = await assertParticipant(appointment, req.user);
  if (!isDoctor && !isAdmin) throw new ApiError(403, "FORBIDDEN", "Only the doctor can complete a visit");

  const settings = await PlatformSetting.getSettings();
  appointment.status = APPOINTMENT_STATUSES.COMPLETED;
  appointment.followUpWindowEndsAt = new Date(Date.now() + settings.followUpWindowDays * 24 * 60 * 60 * 1000);
  await appointment.save();

  // Deduct on completion, not at match/booking time — a session credit isn't wasted if
  // the doctor never actually joined the call.
  if (appointment.sessionSource) {
    await PatientSubscription.findByIdAndUpdate(appointment.sessionSource, {
      $inc: { sessionsRemaining: -1, sessionsUsed: 1 },
    });
  }

  await notify({
    userId: appointment.patient,
    channel: NOTIFICATION_CHANNELS.PUSH,
    type: "follow_up_window_open",
    title: "Free follow-up available",
    body: `You can book a free follow-up with this doctor within the next ${settings.followUpWindowDays} days.`,
    data: { appointmentId: appointment._id, followUpDays: settings.followUpWindowDays },
  });

  return ok(res, appointment, "Appointment marked completed");
});

// "Contact patient by messaging in case of missed incoming call" — deliberately a
// one-off notification through the existing push+WhatsApp channels rather than a new
// persistent chat/inbox system, which is a much bigger feature than what's asked for.
const messagePatient = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
  const { isDoctor, isAdmin } = await assertParticipant(appointment, req.user);
  if (!isDoctor && !isAdmin) throw new ApiError(403, "FORBIDDEN", "Only the doctor can message the patient");

  const { message } = req.body;
  const doctorUser = await User.findById(req.user.id).select("name");

  await notify({
    userId: appointment.patient,
    channel: NOTIFICATION_CHANNELS.PUSH,
    type: "doctor_message",
    title: `Message from Dr. ${doctorUser.name}`,
    body: message,
    data: { appointmentId: appointment._id },
  });
  await notify({
    userId: appointment.patient,
    channel: NOTIFICATION_CHANNELS.WHATSAPP,
    type: "doctor_message",
    title: `Message from Dr. ${doctorUser.name}`,
    body: message,
    data: { appointmentId: appointment._id },
  });

  return ok(res, null, "Message sent to patient");
});

// One convenience call composing everything a doctor needs to see about a patient
// before/during a consult, instead of making the client orchestrate 3 separate requests.
// Gated the same way as messagePatient — only the treating doctor or an admin.
const patientSnapshot = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
  const { isDoctor, isAdmin } = await assertParticipant(appointment, req.user);
  if (!isDoctor && !isAdmin) throw new ApiError(403, "FORBIDDEN", "Only the treating doctor can view this");

  const [patient, recentHealthRecords, recentPrescriptions] = await Promise.all([
    User.findById(appointment.patient).select("name healthId medicalHistory"),
    HealthRecord.find({ owner: appointment.patient }).sort({ recordDate: -1 }).limit(10),
    // appointment.doctor is already this appointment's DoctorProfile id — scoping
    // prescriptions to it (not just patient) means the doctor only sees prescriptions
    // they themselves issued, not every doctor's history for this patient.
    Prescription.find({ patient: appointment.patient, doctor: appointment.doctor }).sort({ createdAt: -1 }).limit(10),
  ]);
  if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found");

  return ok(res, {
    name: patient.name,
    healthId: patient.healthId || null,
    medicalHistory: patient.medicalHistory || null,
    recentHealthRecords,
    recentPrescriptions,
  });
});

module.exports = {
  book,
  bookInstant,
  list,
  getOne,
  reschedule,
  cancel,
  accept,
  reject,
  complete,
  messagePatient,
  patientSnapshot,
};
