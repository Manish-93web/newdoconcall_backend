const Appointment = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");
const { computeSplit } = require("../services/commission/commission.service");
const { notify } = require("../services/notification/notification.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const { APPOINTMENT_STATUSES, NOTIFICATION_CHANNELS, ROLES } = require("../config/constants");

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
    data: { appointmentId: appointment._id },
  });

  return created(res, appointment, "Appointment booked");
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

  appointment.status = APPOINTMENT_STATUSES.COMPLETED;
  appointment.followUpWindowEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await appointment.save();
  return ok(res, appointment, "Appointment marked completed");
});

module.exports = { book, list, getOne, reschedule, cancel, accept, reject, complete };
