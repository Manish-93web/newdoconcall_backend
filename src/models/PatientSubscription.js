const mongoose = require("mongoose");

const patientSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
    sessionsRemaining: { type: Number, required: true, min: 0 },
    sessionsUsed: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active", index: true },
    startedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PatientSubscription", patientSubscriptionSchema);
