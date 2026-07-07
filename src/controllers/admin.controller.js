const User = require("../models/User");
const DoctorProfile = require("../models/DoctorProfile");
const ClinicProfile = require("../models/ClinicProfile");
const Appointment = require("../models/Appointment");
const Payment = require("../models/Payment");
const ConsultationSession = require("../models/ConsultationSession");
const { ok, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const { PAYMENT_STATUSES } = require("../config/constants");

// --- Users ---

const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, status } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = {};
  if (role) query.role = role;
  if (status) query.status = status;

  const [users, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    User.countDocuments(query),
  ]);

  return ok(res, users, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const suspendUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { status: "suspended" }, { new: true });
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  return ok(res, user, "User suspended");
});

const reactivateUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { status: "active" }, { new: true });
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  return ok(res, user, "User reactivated");
});

// --- Doctor verification ---

const pendingDoctors = asyncHandler(async (req, res) => {
  const doctors = await DoctorProfile.find({ "verification.status": "pending" }).populate("user", "name email phone");
  return ok(res, doctors);
});

const verifyDoctor = asyncHandler(async (req, res) => {
  const doctor = await DoctorProfile.findByIdAndUpdate(
    req.params.id,
    {
      "verification.status": "verified",
      "verification.reviewedBy": req.user.id,
      "verification.reviewedAt": new Date(),
      isListed: true,
    },
    { new: true }
  );
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor profile not found");
  return ok(res, doctor, "Doctor verified");
});

const rejectDoctor = asyncHandler(async (req, res) => {
  const doctor = await DoctorProfile.findByIdAndUpdate(
    req.params.id,
    {
      "verification.status": "rejected",
      "verification.reviewedBy": req.user.id,
      "verification.reviewedAt": new Date(),
      "verification.rejectionReason": req.body.reason,
      isListed: false,
    },
    { new: true }
  );
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor profile not found");
  return ok(res, doctor, "Doctor rejected");
});

// --- Clinic verification ---

const pendingClinics = asyncHandler(async (req, res) => {
  const clinics = await ClinicProfile.find({ "verification.status": "pending" }).populate("owner", "name email phone");
  return ok(res, clinics);
});

const verifyClinic = asyncHandler(async (req, res) => {
  const clinic = await ClinicProfile.findByIdAndUpdate(
    req.params.id,
    { "verification.status": "verified", "verification.reviewedBy": req.user.id, "verification.reviewedAt": new Date() },
    { new: true }
  );
  if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
  return ok(res, clinic, "Clinic verified");
});

const rejectClinic = asyncHandler(async (req, res) => {
  const clinic = await ClinicProfile.findByIdAndUpdate(
    req.params.id,
    {
      "verification.status": "rejected",
      "verification.reviewedBy": req.user.id,
      "verification.reviewedAt": new Date(),
      "verification.rejectionReason": req.body.reason,
    },
    { new: true }
  );
  if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
  return ok(res, clinic, "Clinic rejected");
});

// --- Monitoring ---

const listAppointments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = {};
  if (status) query.status = status;

  const [appointments, total] = await Promise.all([
    Appointment.find(query)
      .populate({ path: "doctor", populate: { path: "user", select: "name" } })
      .populate("patient", "name")
      .sort({ scheduledStart: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Appointment.countDocuments(query),
  ]);

  return ok(res, appointments, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const listPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, purpose } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = {};
  if (status) query.status = status;
  if (purpose) query.purpose = purpose;

  const [payments, total] = await Promise.all([
    Payment.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Payment.countDocuments(query),
  ]);

  return ok(res, payments, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const analyticsOverview = asyncHandler(async (req, res) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [usersByRole, userGrowth, consultationsByState, revenueAgg, appointmentCount] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    ConsultationSession.aggregate([{ $group: { _id: "$state", count: { $sum: 1 } } }]),
    Payment.aggregate([
      { $match: { status: PAYMENT_STATUSES.SUCCEEDED } },
      { $group: { _id: "$purpose", totalAmount: { $sum: "$amount" }, totalCommission: { $sum: "$commissionAmount" } } },
    ]),
    Appointment.countDocuments(),
  ]);

  return ok(res, {
    usersByRole,
    userGrowth,
    consultationsByState,
    revenueByPurpose: revenueAgg,
    totalAppointments: appointmentCount,
  });
});

module.exports = {
  listUsers,
  suspendUser,
  reactivateUser,
  pendingDoctors,
  verifyDoctor,
  rejectDoctor,
  pendingClinics,
  verifyClinic,
  rejectClinic,
  listAppointments,
  listPayments,
  analyticsOverview,
};
