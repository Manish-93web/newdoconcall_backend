const mongoose = require("mongoose");
const { VERIFICATION_STATUSES } = require("../config/constants");

const labSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
      // No default on `type` — see DoctorProfile.js's geoPointSchema comment for why.
      geo: {
        type: { type: String, enum: ["Point"] },
        coordinates: { type: [Number], default: undefined },
      },
    },
    testsOffered: [
      {
        test: { type: mongoose.Schema.Types.ObjectId, ref: "DiagnosticTest", required: true },
        price: { type: Number, required: true },
        homeCollectionAvailable: { type: Boolean, default: true },
        homeCollectionFee: { type: Number, default: 0 },
      },
    ],
    verification: {
      status: { type: String, enum: Object.values(VERIFICATION_STATUSES), default: "pending" },
    },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

labSchema.index({ "address.geo": "2dsphere" });

module.exports = mongoose.model("Lab", labSchema);
