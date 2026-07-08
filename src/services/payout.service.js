const Payment = require("../models/Payment");
const Payout = require("../models/Payout");
const DoctorProfile = require("../models/DoctorProfile");
const { PAYMENT_PURPOSES, PAYMENT_STATUSES } = require("../config/constants");

// Groups un-paid-out, succeeded appointment payments by doctor within [periodStart, periodEnd)
// into one Payout per doctor. Idempotent per payment via Payment.payout. Shared by the
// admin-triggered POST /payouts/generate route and the monthly payoutGeneration cron job.
async function generatePayoutsForPeriod(periodStart, periodEnd) {
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

  return payouts;
}

module.exports = { generatePayoutsForPeriod };
