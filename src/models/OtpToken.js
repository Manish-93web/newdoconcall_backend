const mongoose = require("mongoose");

const otpTokenSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, index: true }, // phone or email
    otpHash: { type: String, required: true },
    purpose: { type: String, enum: ["signup", "login", "reset"], required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

otpTokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 }); // TTL cleanup, 1h

module.exports = mongoose.model("OtpToken", otpTokenSchema);
