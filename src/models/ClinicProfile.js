const mongoose = require("mongoose");
const { VERIFICATION_STATUSES } = require("../config/constants");

const clinicProfileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ["clinic", "hospital"], default: "clinic" },
    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
      geo: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], default: undefined },
      },
    },
    doctors: [{ type: mongoose.Schema.Types.ObjectId, ref: "DoctorProfile" }],
    staff: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    operatingHours: [
      {
        dayOfWeek: { type: Number, min: 0, max: 6 },
        startTime: String,
        endTime: String,
      },
    ],
    subscriptionPlan: {
      tier: { type: String, enum: ["free", "ray_basic", "ray_pro"], default: "free" },
      status: { type: String, enum: ["active", "past_due", "cancelled"], default: "active" },
      currentPeriodEnd: Date,
    },
    verification: {
      status: { type: String, enum: Object.values(VERIFICATION_STATUSES), default: "pending" },
      documents: [
        {
          type: { type: String },
          fileRef: { type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" },
        },
      ],
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
      rejectionReason: String,
    },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

clinicProfileSchema.index({ "address.geo": "2dsphere" });

module.exports = mongoose.model("ClinicProfile", clinicProfileSchema);
