const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const OtpToken = require("../../models/OtpToken");
const { sendOtp } = require("../notification/notification.service");

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function generateOtpCode() {
  return crypto.randomInt(100000, 999999).toString();
}

async function requestOtp(identifier, purpose) {
  const code = generateOtpCode();
  const otpHash = await bcrypt.hash(code, 10);
  await OtpToken.create({
    identifier,
    otpHash,
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
  });
  await sendOtp(identifier, code, purpose);
  return { expiresInMinutes: OTP_TTL_MINUTES };
}

async function verifyOtp(identifier, purpose, code) {
  const token = await OtpToken.findOne({ identifier, purpose, consumedAt: null }).sort({
    createdAt: -1,
  });

  if (!token) return { valid: false, reason: "No OTP requested for this identifier" };
  if (token.expiresAt < new Date()) return { valid: false, reason: "OTP expired" };
  if (token.attempts >= MAX_ATTEMPTS) return { valid: false, reason: "Too many attempts" };

  const matches = await bcrypt.compare(code, token.otpHash);
  if (!matches) {
    token.attempts += 1;
    await token.save();
    return { valid: false, reason: "Incorrect OTP" };
  }

  token.consumedAt = new Date();
  await token.save();
  return { valid: true };
}

module.exports = { requestOtp, verifyOtp };
