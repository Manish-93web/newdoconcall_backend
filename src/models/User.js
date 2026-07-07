const mongoose = require("mongoose");
const { ALL_ROLES } = require("../config/constants");

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: "home" },
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
    geo: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ALL_ROLES, required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
    phone: { type: String, trim: true, sparse: true, unique: true },
    passwordHash: { type: String, select: false },
    authProviders: [
      {
        provider: { type: String, enum: ["google"] },
        providerId: String,
      },
    ],
    dob: Date,
    gender: { type: String, enum: ["male", "female", "other"] },
    profileImage: { type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    addresses: [addressSchema],
    status: {
      type: String,
      enum: ["active", "suspended", "pending_verification"],
      default: "active",
      index: true,
    },
    fcmTokens: [String],
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ "addresses.geo": "2dsphere" });

module.exports = mongoose.model("User", userSchema);
