const bcrypt = require("bcryptjs");
const User = require("../models/User");
const DoctorProfile = require("../models/DoctorProfile");
const ClinicProfile = require("../models/ClinicProfile");
const Appointment = require("../models/Appointment");
const Payment = require("../models/Payment");
const ConsultationSession = require("../models/ConsultationSession");
const PlatformSetting = require("../models/PlatformSetting");
const AuditLog = require("../models/AuditLog");
const NotificationTemplate = require("../models/NotificationTemplate");
const { notify } = require("../services/notification/notification.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditLog } = require("../utils/auditLog");
const { PAYMENT_STATUSES, ROLES, CONSULTATION_STATES, ALL_ADMIN_CAPABILITIES } = require("../config/constants");

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

// Omit adminCapabilities to create a full admin (identical, unrestricted access — the
// classic account shape); pass an array to create a capability-scoped sub-admin instead.
// See rbac.middleware.js's requireCapability().
const createAdmin = asyncHandler(async (req, res) => {
  const { name, email, phone, password, adminCapabilities } = req.body;

  const orConditions = [email && { email }, phone && { phone }].filter(Boolean);
  const existing = await User.findOne({ $or: orConditions });
  if (existing) throw new ApiError(409, "USER_EXISTS", "An account with this email/phone already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await User.create({
    name,
    email,
    phone,
    passwordHash,
    role: ROLES.PLATFORM_ADMIN,
    adminCapabilities,
  });

  await recordAuditLog(req.user, "create_admin", "User", admin._id, null, { name, email, phone, adminCapabilities }, req);

  const result = admin.toObject();
  delete result.passwordHash;
  return created(res, result, "Admin account created");
});

const listAdminCapabilities = asyncHandler(async (req, res) => {
  return ok(res, ALL_ADMIN_CAPABILITIES);
});

const updateAdminCapabilities = asyncHandler(async (req, res) => {
  const { adminCapabilities } = req.body;
  const admin = await User.findOne({ _id: req.params.id, role: ROLES.PLATFORM_ADMIN });
  if (!admin) throw new ApiError(404, "NOT_FOUND", "Admin account not found");

  const before = { adminCapabilities: admin.adminCapabilities };
  admin.adminCapabilities = adminCapabilities;
  await admin.save();

  await recordAuditLog(req.user, "update_admin_capabilities", "User", admin._id, before, { adminCapabilities }, req);
  return ok(res, admin, "Admin capabilities updated");
});

const suspendUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  const before = { status: user.status };
  user.status = "suspended";
  await user.save();
  await recordAuditLog(req.user, "suspend_user", "User", user._id, before, { status: user.status }, req);
  return ok(res, user, "User suspended");
});

const reactivateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  const before = { status: user.status };
  user.status = "active";
  await user.save();
  await recordAuditLog(req.user, "reactivate_user", "User", user._id, before, { status: user.status }, req);
  return ok(res, user, "User reactivated");
});

// --- Doctor verification ---

const pendingDoctors = asyncHandler(async (req, res) => {
  const doctors = await DoctorProfile.find({ "verification.status": "pending" }).populate("user", "name email phone");
  return ok(res, doctors);
});

const verifyDoctor = asyncHandler(async (req, res) => {
  const doctor = await DoctorProfile.findById(req.params.id);
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor profile not found");
  const before = { status: doctor.verification.status };
  doctor.verification.status = "verified";
  doctor.verification.reviewedBy = req.user.id;
  doctor.verification.reviewedAt = new Date();
  doctor.isListed = true;
  await doctor.save();
  await recordAuditLog(req.user, "verify_doctor", "DoctorProfile", doctor._id, before, { status: "verified" }, req);
  return ok(res, doctor, "Doctor verified");
});

const rejectDoctor = asyncHandler(async (req, res) => {
  const doctor = await DoctorProfile.findById(req.params.id);
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor profile not found");
  const before = { status: doctor.verification.status };
  doctor.verification.status = "rejected";
  doctor.verification.reviewedBy = req.user.id;
  doctor.verification.reviewedAt = new Date();
  doctor.verification.rejectionReason = req.body.reason;
  doctor.isListed = false;
  await doctor.save();
  await recordAuditLog(
    req.user,
    "reject_doctor",
    "DoctorProfile",
    doctor._id,
    before,
    { status: "rejected", reason: req.body.reason },
    req
  );
  return ok(res, doctor, "Doctor rejected");
});

// --- Clinic verification ---

const pendingClinics = asyncHandler(async (req, res) => {
  const clinics = await ClinicProfile.find({ "verification.status": "pending" }).populate("owner", "name email phone");
  return ok(res, clinics);
});

const verifyClinic = asyncHandler(async (req, res) => {
  const clinic = await ClinicProfile.findById(req.params.id);
  if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
  const before = { status: clinic.verification.status };
  clinic.verification.status = "verified";
  clinic.verification.reviewedBy = req.user.id;
  clinic.verification.reviewedAt = new Date();
  await clinic.save();
  await recordAuditLog(req.user, "verify_clinic", "ClinicProfile", clinic._id, before, { status: "verified" }, req);
  return ok(res, clinic, "Clinic verified");
});

const rejectClinic = asyncHandler(async (req, res) => {
  const clinic = await ClinicProfile.findById(req.params.id);
  if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
  const before = { status: clinic.verification.status };
  clinic.verification.status = "rejected";
  clinic.verification.reviewedBy = req.user.id;
  clinic.verification.reviewedAt = new Date();
  clinic.verification.rejectionReason = req.body.reason;
  await clinic.save();
  await recordAuditLog(
    req.user,
    "reject_clinic",
    "ClinicProfile",
    clinic._id,
    before,
    { status: "rejected", reason: req.body.reason },
    req
  );
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

// Sessions currently in progress (not yet ended/missed/failed) — distinct from
// listAppointments above, which is a historical record regardless of live call state.
const liveConsultations = asyncHandler(async (req, res) => {
  const LIVE_STATES = [CONSULTATION_STATES.RINGING, CONSULTATION_STATES.CONNECTED, CONSULTATION_STATES.ON_HOLD];
  const sessions = await ConsultationSession.find({ state: { $in: LIVE_STATES } })
    .populate({
      path: "appointment",
      populate: [
        { path: "doctor", populate: { path: "user", select: "name" } },
        { path: "patient", select: "name" },
      ],
    })
    .sort({ startedAt: -1 });
  return ok(res, sessions);
});

function buildPaymentsQuery({ status, purpose, from, to }) {
  const query = {};
  if (status) query.status = status;
  if (purpose) query.purpose = purpose;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }
  return query;
}

const listPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, purpose, from, to } = req.query;
  const { skip } = parsePagination({ page, limit });
  const query = buildPaymentsQuery({ status, purpose, from, to });

  const [payments, total, summaryAgg] = await Promise.all([
    Payment.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Payment.countDocuments(query),
    Payment.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalCommission: { $sum: "$commissionAmount" },
        },
      },
    ]),
  ]);

  return ok(res, payments, "OK", {
    ...buildMeta({ page: Number(page), limit: Number(limit), total }),
    summary: summaryAgg[0]
      ? { count: summaryAgg[0].count, totalAmount: summaryAgg[0].totalAmount, totalCommission: summaryAgg[0].totalCommission }
      : { count: 0, totalAmount: 0, totalCommission: 0 },
  });
});

// Streams the full filtered set (not just the current page) as CSV — web-only consumer,
// no bulk-download precedent existed anywhere else in this codebase before this.
const exportPayments = asyncHandler(async (req, res) => {
  const { status, purpose, from, to } = req.query;
  const query = buildPaymentsQuery({ status, purpose, from, to });
  const payments = await Payment.find(query).sort({ createdAt: -1 });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="payments-export.csv"');
  res.write("Date,Purpose,Amount,Commission,Status,PaymentId\n");
  for (const p of payments) {
    res.write(`${p.createdAt.toISOString()},${p.purpose},${p.amount},${p.commissionAmount},${p.status},${p._id}\n`);
  }
  res.end();
});

const analyticsOverview = asyncHandler(async (req, res) => {
  const now = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    usersByRole,
    userGrowth,
    consultationsByState,
    revenueAgg,
    appointmentCount,
    activeUsers,
    sessionUsage,
    durationAgg,
    durationByDoctorAgg,
    topDoctorsAgg,
    prevMonthPatients,
    currentMonthPatients,
  ] = await Promise.all([
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
    User.countDocuments({ lastLoginAt: { $gte: thirtyDaysAgo } }),
    ConsultationSession.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    ConsultationSession.aggregate([
      { $match: { state: CONSULTATION_STATES.ENDED, durationSeconds: { $ne: null } } },
      {
        $group: {
          _id: null,
          avgDurationSeconds: { $avg: "$durationSeconds" },
          totalMinutes: { $sum: { $divide: ["$durationSeconds", 60] } },
          count: { $sum: 1 },
        },
      },
    ]),
    ConsultationSession.aggregate([
      { $match: { state: CONSULTATION_STATES.ENDED, durationSeconds: { $ne: null } } },
      { $lookup: { from: "appointments", localField: "appointment", foreignField: "_id", as: "appt" } },
      { $unwind: "$appt" },
      {
        $group: {
          _id: "$appt.doctor",
          avgDurationSeconds: { $avg: "$durationSeconds" },
          totalMinutes: { $sum: { $divide: ["$durationSeconds", 60] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalMinutes: -1 } },
      { $limit: 10 },
    ]),
    Appointment.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: "$doctor", appointments: { $sum: 1 }, revenue: { $sum: "$fee.amount" } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
    Appointment.distinct("patient", {
      status: "completed",
      scheduledStart: { $gte: prevMonthStart, $lt: currentMonthStart },
    }),
    Appointment.distinct("patient", { status: "completed", scheduledStart: { $gte: currentMonthStart } }),
  ]);

  // Resolve doctor names once for both duration-by-doctor and topDoctors.
  const doctorIds = [
    ...new Set([...durationByDoctorAgg.map((d) => d._id?.toString()), ...topDoctorsAgg.map((d) => d._id?.toString())]),
  ].filter(Boolean);
  const doctors = await DoctorProfile.find({ _id: { $in: doctorIds } })
    .populate("user", "name")
    .select("user ratingAvg");
  const doctorInfo = new Map(
    doctors.map((d) => [d._id.toString(), { name: d.user?.name || "Unknown", ratingAvg: d.ratingAvg || 0 }])
  );

  const currentMonthPatientIds = new Set(currentMonthPatients.map(String));
  const retainedCount = prevMonthPatients.filter((p) => currentMonthPatientIds.has(String(p))).length;
  const retentionPercent = prevMonthPatients.length ? Math.round((retainedCount / prevMonthPatients.length) * 100) : 0;

  return ok(res, {
    usersByRole,
    userGrowth,
    consultationsByState,
    revenueByPurpose: revenueAgg,
    totalAppointments: appointmentCount,
    activeUsers,
    sessionUsage,
    retentionRate: {
      percent: retentionPercent,
      cohortSize: prevMonthPatients.length,
      retainedCount,
      periodLabel: `${prevMonthStart.toLocaleString("default", { month: "short", year: "numeric" })} → ${currentMonthStart.toLocaleString("default", { month: "short", year: "numeric" })}`,
    },
    topDoctors: topDoctorsAgg.map((d) => ({
      doctorId: d._id,
      doctorName: doctorInfo.get(d._id?.toString())?.name || "Unknown",
      appointments: d.appointments,
      revenue: d.revenue,
      ratingAvg: doctorInfo.get(d._id?.toString())?.ratingAvg || 0,
    })),
    durationSummary: durationAgg[0] || { avgDurationSeconds: 0, totalMinutes: 0, count: 0 },
    durationByDoctor: durationByDoctorAgg.map((d) => ({
      doctorId: d._id,
      doctorName: doctorInfo.get(d._id?.toString())?.name || "Unknown",
      avgDurationSeconds: d.avgDurationSeconds,
      totalMinutes: d.totalMinutes,
      count: d.count,
    })),
  });
});

// --- Audit logs ---

const listAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, actor, action, entityType, from, to } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = {};
  if (actor) query.actor = actor;
  if (action) query.action = action;
  if (entityType) query.entityType = entityType;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query).populate("actor", "name email role").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    AuditLog.countDocuments(query),
  ]);

  return ok(res, logs, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

// --- Notification control ---

// Sequential, not Promise.all — a broadcast to "all users" can be large, and notify()
// does its own per-recipient DB write; sequential avoids a write-burst. A real job queue
// would be the right answer at much larger scale — out of scope here.
const broadcastNotification = asyncHandler(async (req, res) => {
  const { title, body, channels, target } = req.body;

  let userIds;
  if (target.type === "all") {
    userIds = (await User.find({ status: "active" }).select("_id")).map((u) => u._id);
  } else if (target.type === "role") {
    userIds = (await User.find({ role: target.role, status: "active" }).select("_id")).map((u) => u._id);
  } else {
    userIds = [target.userId];
  }

  let sent = 0;
  for (const userId of userIds) {
    for (const channel of channels) {
      await notify({ userId, channel, type: "admin_broadcast", title, body, data: {} });
      sent += 1;
    }
  }

  await recordAuditLog(
    req.user,
    "broadcast_notification",
    "Notification",
    null,
    null,
    { title, target, channels, recipientCount: userIds.length },
    req
  );

  return ok(res, { recipientCount: userIds.length, sent }, "Broadcast sent");
});

const listNotificationTemplates = asyncHandler(async (req, res) => {
  const templates = await NotificationTemplate.find().sort({ key: 1 });
  return ok(res, templates);
});

const updateNotificationTemplate = asyncHandler(async (req, res) => {
  const template = await NotificationTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, "NOT_FOUND", "Notification template not found");
  const before = template.toObject();
  Object.assign(template, req.body);
  await template.save();
  await recordAuditLog(req.user, "update_notification_template", "NotificationTemplate", template._id, before, req.body, req);
  return ok(res, template, "Template updated");
});

// --- Platform settings ---

const getSettings = asyncHandler(async (req, res) => {
  const settings = await PlatformSetting.getSettings();
  return ok(res, settings);
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await PlatformSetting.getSettings();
  Object.assign(settings, req.body);
  await settings.save();
  return ok(res, settings, "Platform settings updated");
});

module.exports = {
  listUsers,
  createAdmin,
  listAdminCapabilities,
  updateAdminCapabilities,
  suspendUser,
  reactivateUser,
  pendingDoctors,
  verifyDoctor,
  rejectDoctor,
  pendingClinics,
  verifyClinic,
  rejectClinic,
  listAppointments,
  liveConsultations,
  listPayments,
  exportPayments,
  analyticsOverview,
  listAuditLogs,
  broadcastNotification,
  listNotificationTemplates,
  updateNotificationTemplate,
  getSettings,
  updateSettings,
};
