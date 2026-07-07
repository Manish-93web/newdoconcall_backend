const mongoose = require("mongoose");
const { VERIFICATION_STATUSES } = require("../config/constants");

const geoPointSchema = {
  type: { type: String, enum: ["Point"], default: "Point" },
  coordinates: { type: [Number], default: undefined }, // [lng, lat]
};

const doctorProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    specializations: [{ type: mongoose.Schema.Types.ObjectId, ref: "Specialization" }],
    qualifications: [
      {
        degree: String,
        institute: String,
        year: Number,
      },
    ],
    registrationNumber: String,
    registrationCouncil: String,
    experienceYears: { type: Number, default: 0 },
    bio: String,
    consultationFee: {
      inClinic: { type: Number, default: 0 },
      video: { type: Number, default: 0 },
      voice: { type: Number, default: 0 },
      chat: { type: Number, default: 0 },
    },
    clinics: [{ type: mongoose.Schema.Types.ObjectId, ref: "ClinicProfile" }],
    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
      geo: geoPointSchema,
    },
    availability: [
      {
        clinic: { type: mongoose.Schema.Types.ObjectId, ref: "ClinicProfile", default: null },
        dayOfWeek: { type: Number, min: 0, max: 6 }, // 0 = Sunday
        startTime: String, // "09:00"
        endTime: String, // "13:00"
        slotDurationMinutes: { type: Number, default: 15 },
      },
    ],
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
    isListed: { type: Boolean, default: false },
    listingFeeStatus: { type: String, enum: ["unpaid", "paid", "waived"], default: "unpaid" },
    bankAccount: {
      accountHolder: String,
      accountNumberEnc: String,
      ifsc: String,
      upiId: String,
    },
  },
  { timestamps: true }
);

doctorProfileSchema.index({ "address.geo": "2dsphere" });
doctorProfileSchema.index({ specializations: 1 });
doctorProfileSchema.index({ "verification.status": 1 });

module.exports = mongoose.model("DoctorProfile", doctorProfileSchema);
