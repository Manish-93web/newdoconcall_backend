const mongoose = require("mongoose");
const Payout = require("../models/Payout");
const Payment = require("../models/Payment");
const DoctorProfile = require("../models/DoctorProfile");
const Appointment = require("../models/Appointment");
const { generatePayoutsForPeriod } = require("../services/payout.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const { ROLES, PAYMENT_STATUSES, PAYMENT_PURPOSES } = require("../config/constants");

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = req.user.role === ROLES.PLATFORM_ADMIN ? {} : { payee: req.user.id };
  if (status) query.status = status;

  const [payouts, total] = await Promise.all([
    Payout.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Payout.countDocuments(query),
  ]);

  return ok(res, payouts, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

// Admin-triggered on-demand generation — the monthly payoutGeneration cron job calls the
// same generatePayoutsForPeriod() directly, without going through this route.
const generate = asyncHandler(async (req, res) => {
  const { periodStart, periodEnd } = req.body;
  const payouts = await generatePayoutsForPeriod(periodStart, periodEnd);
  return created(res, payouts, `Generated ${payouts.length} payout(s)`);
});

const markPaid = asyncHandler(async (req, res) => {
  const payout = await Payout.findById(req.params.id);
  if (!payout) throw new ApiError(404, "NOT_FOUND", "Payout not found");

  payout.status = "paid";
  await payout.save();
  return ok(res, payout, "Payout marked as paid");
});

const doctorEarningsSummary = asyncHandler(async (req, res) => {
  const doctor = await DoctorProfile.findOne({ user: req.user.id });
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor profile not found");

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const paymentMatchStages = [
    {
      $match: {
        purpose: PAYMENT_PURPOSES.APPOINTMENT,
        status: PAYMENT_STATUSES.SUCCEEDED,
      },
    },
    {
      $lookup: { from: "appointments", localField: "referenceId", foreignField: "_id", as: "appointment" },
    },
    { $unwind: "$appointment" },
    { $match: { "appointment.doctor": doctor._id } },
  ];

  const [[summary], monthlyEarnings, totalAppointments, completedAppointments] = await Promise.all([
    Payment.aggregate([
      ...paymentMatchStages,
      {
        $group: {
          _id: null,
          totalEarned: { $sum: "$netToProvider" },
          totalPaidOut: {
            $sum: { $cond: [{ $ne: ["$payout", null] }, "$netToProvider", 0] },
          },
          consultationCount: { $sum: 1 },
        },
      },
    ]),
    // Mirrors admin.controller.js's analyticsOverview userGrowth aggregation — same
    // $dateToString/$group shape, scoped to this one doctor's payments instead of
    // platform-wide user signups.
    Payment.aggregate([
      ...paymentMatchStages,
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          amount: { $sum: "$netToProvider" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Appointment.countDocuments({ doctor: doctor._id }),
    Appointment.countDocuments({ doctor: doctor._id, status: "completed" }),
  ]);

  const result = summary || { totalEarned: 0, totalPaidOut: 0, consultationCount: 0 };
  result.pendingPayout = result.totalEarned - result.totalPaidOut;
  result.ratingAvg = doctor.ratingAvg || 0;
  result.ratingCount = doctor.ratingCount || 0;
  result.completionRate = totalAppointments ? Math.round((completedAppointments / totalAppointments) * 100) : 0;
  result.monthlyEarnings = monthlyEarnings.map((m) => ({ month: m._id, amount: m.amount }));

  return ok(res, result);
});

module.exports = { list, generate, markPaid, doctorEarningsSummary };
