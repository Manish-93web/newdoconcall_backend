const ClinicProfile = require("../models/ClinicProfile");
const DoctorProfile = require("../models/DoctorProfile");
const Appointment = require("../models/Appointment");
const User = require("../models/User");
const { geocodeAddress } = require("../services/maps/googleMaps.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const { ROLES } = require("../config/constants");

async function assertOwnedClinic(clinicId, userId) {
  const clinic = await ClinicProfile.findById(clinicId);
  if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
  if (clinic.owner.toString() !== userId) {
    throw new ApiError(403, "FORBIDDEN", "You do not manage this clinic");
  }
  return clinic;
}

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { skip } = parsePagination({ page, limit });
  const [clinics, total] = await Promise.all([
    ClinicProfile.find({ "verification.status": "verified" }).skip(skip).limit(Number(limit)),
    ClinicProfile.countDocuments({ "verification.status": "verified" }),
  ]);
  return ok(res, clinics, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const getOne = asyncHandler(async (req, res) => {
  const clinic = await ClinicProfile.findById(req.params.id).populate({
    path: "doctors",
    populate: { path: "user", select: "name" },
  });
  if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
  return ok(res, clinic);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (payload.address?.line1 || payload.address?.city) {
    const geo = await geocodeAddress(payload.address);
    if (geo) payload.address.geo = geo;
  }
  const clinic = await ClinicProfile.create({ ...payload, owner: req.user.id });
  return created(res, clinic, "Clinic created");
});

const update = asyncHandler(async (req, res) => {
  const clinic = await assertOwnedClinic(req.params.id, req.user.id);
  const payload = { ...req.body };
  if (payload.address?.line1 || payload.address?.city) {
    const geo = await geocodeAddress(payload.address);
    if (geo) payload.address.geo = geo;
  }
  Object.assign(clinic, payload);
  await clinic.save();
  return ok(res, clinic, "Clinic updated");
});

const listMine = asyncHandler(async (req, res) => {
  const clinics = await ClinicProfile.find({ $or: [{ owner: req.user.id }, { staff: req.user.id }] });
  return ok(res, clinics);
});

const getDoctors = asyncHandler(async (req, res) => {
  const clinic = await ClinicProfile.findById(req.params.id).populate({
    path: "doctors",
    populate: [{ path: "user", select: "name" }, { path: "specializations", select: "name" }],
  });
  if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
  return ok(res, clinic.doctors);
});

const addStaff = asyncHandler(async (req, res) => {
  const clinic = await assertOwnedClinic(req.params.id, req.user.id);
  const { userId } = req.body;
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found");

  user.role = ROLES.CLINIC_STAFF;
  await user.save();

  await ClinicProfile.findByIdAndUpdate(clinic._id, { $addToSet: { staff: userId } });
  return ok(res, null, "Staff added");
});

const removeStaff = asyncHandler(async (req, res) => {
  const clinic = await assertOwnedClinic(req.params.id, req.user.id);
  await ClinicProfile.findByIdAndUpdate(clinic._id, { $pull: { staff: req.params.userId } });
  return ok(res, null, "Staff removed");
});

const addDoctor = asyncHandler(async (req, res) => {
  const clinic = await assertOwnedClinic(req.params.id, req.user.id);
  const { doctorProfileId } = req.body;
  const doctor = await DoctorProfile.findById(doctorProfileId);
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor profile not found");

  await ClinicProfile.findByIdAndUpdate(clinic._id, { $addToSet: { doctors: doctorProfileId } });
  await DoctorProfile.findByIdAndUpdate(doctorProfileId, { $addToSet: { clinics: clinic._id } });
  return ok(res, null, "Doctor linked to clinic");
});

const removeDoctor = asyncHandler(async (req, res) => {
  const clinic = await assertOwnedClinic(req.params.id, req.user.id);
  await ClinicProfile.findByIdAndUpdate(clinic._id, { $pull: { doctors: req.params.doctorId } });
  await DoctorProfile.findByIdAndUpdate(req.params.doctorId, { $pull: { clinics: clinic._id } });
  return ok(res, null, "Doctor unlinked from clinic");
});

function isOwnerStaffOrAdmin(clinic, user) {
  return (
    clinic.owner.toString() === user.id ||
    clinic.staff.some((s) => s.toString() === user.id) ||
    user.role === ROLES.PLATFORM_ADMIN
  );
}

const getAnalytics = asyncHandler(async (req, res) => {
  const clinic = await ClinicProfile.findById(req.params.id);
  if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
  if (!isOwnerStaffOrAdmin(clinic, req.user)) {
    throw new ApiError(403, "FORBIDDEN", "You do not manage this clinic");
  }

  const [appointmentsByStatus, appointmentsByMode, revenueAgg, doctorPerformance] = await Promise.all([
    Appointment.aggregate([
      { $match: { clinic: clinic._id } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Appointment.aggregate([
      { $match: { clinic: clinic._id } },
      { $group: { _id: "$mode", count: { $sum: 1 } } },
    ]),
    Appointment.aggregate([
      { $match: { clinic: clinic._id, status: "completed" } },
      { $group: { _id: null, totalRevenue: { $sum: "$fee.amount" }, completedCount: { $sum: 1 } } },
    ]),
    Appointment.aggregate([
      { $match: { clinic: clinic._id, status: "completed" } },
      { $group: { _id: "$doctor", appointments: { $sum: 1 }, revenue: { $sum: "$fee.amount" } } },
      { $sort: { revenue: -1 } },
    ]),
  ]);

  const doctors = await DoctorProfile.find({ _id: { $in: doctorPerformance.map((d) => d._id) } }).populate(
    "user",
    "name"
  );
  const doctorNames = new Map(doctors.map((d) => [d._id.toString(), d.user?.name || "Unknown"]));

  return ok(res, {
    appointmentsByStatus,
    appointmentsByMode,
    revenue: revenueAgg[0] || { totalRevenue: 0, completedCount: 0 },
    doctorPerformance: doctorPerformance.map((d) => ({
      doctorId: d._id,
      doctorName: doctorNames.get(d._id.toString()) || "Unknown",
      appointments: d.appointments,
      revenue: d.revenue,
    })),
  });
});

const getStaff = asyncHandler(async (req, res) => {
  const clinic = await ClinicProfile.findById(req.params.id).populate({
    path: "staff",
    select: "name email phone role",
  });
  if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
  return ok(res, clinic.staff);
});

module.exports = {
  list,
  getOne,
  create,
  update,
  listMine,
  getDoctors,
  addStaff,
  removeStaff,
  getStaff,
  addDoctor,
  removeDoctor,
  getAnalytics,
};
