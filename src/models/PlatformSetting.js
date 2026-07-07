const mongoose = require("mongoose");

const platformSettingSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "default", unique: true },
    doctorListingFee: { type: Number, default: 999 },
    consultationCommissionPercent: { type: Number, default: 15 },
    pharmacyCommissionPercent: { type: Number, default: 10 },
    diagnosticMarginPercent: { type: Number, default: 12 },
    clinicSubscriptionPlans: [
      {
        name: String,
        price: Number,
        billingCycle: { type: String, enum: ["monthly", "yearly"] },
      },
    ],
  },
  { timestamps: true }
);

platformSettingSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ singletonKey: "default" });
  if (!settings) settings = await this.create({ singletonKey: "default" });
  return settings;
};

module.exports = mongoose.model("PlatformSetting", platformSettingSchema);
