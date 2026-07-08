const mongoose = require("mongoose");

// Patient-facing consult-credit plans (e.g. "Annual Health Consultant Plan").
// Distinct from PlatformSetting.clinicSubscriptionPlans, which is the clinic-facing
// "DoconCall Ray" practice-management listing tier — different audience, different shape.
const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    billingCycle: { type: String, enum: ["annual", "one_time"], required: true },
    sessionsIncluded: { type: Number, required: true, min: 0 },
    isFreemium: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
