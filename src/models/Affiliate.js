const mongoose = require("mongoose");

const affiliateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    contactEmail: String,
    contactPhone: String,
    commissionPercent: { type: Number, required: true, min: 0, max: 100 },
    referredDoctors: [{ type: mongoose.Schema.Types.ObjectId, ref: "DoctorProfile" }],
    referredClinics: [{ type: mongoose.Schema.Types.ObjectId, ref: "ClinicProfile" }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Affiliate", affiliateSchema);
