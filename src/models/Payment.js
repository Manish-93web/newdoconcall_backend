const mongoose = require("mongoose");
const { PAYMENT_PURPOSES, PAYMENT_STATUSES } = require("../config/constants");

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: Object.values(PAYMENT_PURPOSES), required: true },
    referenceModel: {
      type: String,
      enum: ["Appointment", "PharmacyOrder", "DiagnosticBooking", "ClinicProfile", "DoctorProfile"],
      required: true,
    },
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "referenceModel" },
    amount: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    stripePaymentIntentId: { type: String, index: true },
    stripeChargeId: String,
    status: { type: String, enum: Object.values(PAYMENT_STATUSES), default: PAYMENT_STATUSES.REQUIRES_PAYMENT },
    commissionAmount: { type: Number, default: 0 },
    netToProvider: { type: Number, default: 0 },
    payout: { type: mongoose.Schema.Types.ObjectId, ref: "Payout", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
