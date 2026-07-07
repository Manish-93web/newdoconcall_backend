const mongoose = require("mongoose");
const Payout = require("../models/Payout");
const Payment = require("../models/Payment");
const DoctorProfile = require("../models/DoctorProfile");
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

// Groups un-paid-out, succeeded appointment payments by doctor within [periodStart, periodEnd)
// into one Payout per doctor. Admin-triggered; idempotent per payment via Payment.payout.
const generate = asyncHandler(async (req, res) => {
  const { periodStart, periodEnd } = req.body;

  const payments = await Payment.find({
    purpose: PAYMENT_PURPOSES.APPOINTMENT,
    status: PAYMENT_STATUSES.SUCCEEDED,
    payout: null,
    createdAt: { $gte: new Date(periodStart), $lt: new Date(periodEnd) },
  }).populate({ path: "referenceId", select: "doctor" });

  const byDoctorProfile = new Map();
  for (const payment of payments) {
    const doctorProfileId = payment.referenceId?.doctor?.toString();
    if (!doctorProfileId) continue;
    if (!byDoctorProfile.has(doctorProfileId)) byDoctorProfile.set(doctorProfileId, []);
    byDoctorProfile.get(doctorProfileId).push(payment);
  }

  const payouts = [];
  for (const [doctorProfileId, doctorPayments] of byDoctorProfile) {
    const doctor = await DoctorProfile.findById(doctorProfileId).select("user");
    if (!doctor) continue;

    const grossAmount = doctorPayments.reduce((sum, p) => sum + p.amount, 0);
    const commissionDeducted = doctorPayments.reduce((sum, p) => sum + p.commissionAmount, 0);
    const netAmount = doctorPayments.reduce((sum, p) => sum + p.netToProvider, 0);

    const payout = await Payout.create({
      payee: doctor.user,
      payeeType: "doctor",
      periodStart,
      periodEnd,
      grossAmount,
      commissionDeducted,
      netAmount,
      status: "pending",
      transactions: doctorPayments.map((p) => p._id),
    });

    await Payment.updateMany(
      { _id: { $in: doctorPayments.map((p) => p._id) } },
      { $set: { payout: payout._id } }
    );

    payouts.push(payout);
  }

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

  const [summary] = await Payment.aggregate([
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
  ]);

  const result = summary || { totalEarned: 0, totalPaidOut: 0, consultationCount: 0 };
  result.pendingPayout = result.totalEarned - result.totalPaidOut;

  return ok(res, result);
});

module.exports = { list, generate, markPaid, doctorEarningsSummary };
