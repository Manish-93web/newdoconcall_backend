const mongoose = require("mongoose");
const { ALL_ROLES, ALL_ADMIN_CAPABILITIES } = require("../config/constants");

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: "home" },
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
    // No default on `type` — see DoctorProfile.js's geoPointSchema comment for why: a
    // default here would make Mongoose auto-vivify a coordinate-less Point on any address
    // pushed without geo (e.g. a home address saved via PATCH /users/me), which the
    // 2dsphere index below rejects at write time.
    geo: {
      type: { type: String, enum: ["Point"] },
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
        provider: { type: String, enum: ["google", "apple"] },
        providerId: String,
      },
    ],
    dob: Date,
    gender: { type: String, enum: ["male", "female", "other"] },
    medicalHistory: {
      bloodGroup: String,
      allergies: [String],
      chronicConditions: [String],
      notes: String,
    },
    profileImage: { type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" },
    healthId: { type: String, unique: true, sparse: true },
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
    // platform_admin only. undefined/unset = a full admin (the classic, pre-RBAC account
    // shape — every existing admin keeps unrestricted access). Once explicitly set (even
    // to an empty array) via the sub-admin creation/edit flow, this admin is scoped to
    // exactly these capabilities — see rbac.middleware.js's requireCapability().
    adminCapabilities: { type: [String], enum: ALL_ADMIN_CAPABILITIES, default: undefined },
  },
  { timestamps: true }
);

userSchema.index({ "addresses.geo": "2dsphere" });

module.exports = mongoose.model("User", userSchema);
