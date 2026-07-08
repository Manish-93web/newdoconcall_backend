const bcrypt = require("bcryptjs");
const User = require("../models/User");
const env = require("../config/env");
const { ROLES } = require("../config/constants");
const { issueTokenPair, verifyRefreshToken, signAccessToken, signRefreshToken } = require("../services/auth/jwt.service");
const { requestOtp, verifyOtp } = require("../services/auth/otp.service");
const { revokeToken, isTokenRevoked } = require("../services/auth/tokenBlacklist.service");
const { verifyGoogleIdToken } = require("../services/auth/googleOAuth.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

function isEmail(identifier) {
  return identifier.includes("@");
}

function toPublicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
  };
}

const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role } = req.body;
  if (!password) throw new ApiError(400, "PASSWORD_REQUIRED", "Password is required for direct registration");

  const existing = await User.findOne({ $or: [{ email }, { phone }].filter((c) => Object.values(c)[0]) });
  if (existing) throw new ApiError(409, "USER_EXISTS", "An account with this email/phone already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    phone,
    passwordHash,
    role: role || ROLES.PATIENT,
  });

  const tokens = issueTokenPair(user);
  return created(res, { user: toPublicUser(user), ...tokens }, "Registered successfully");
});

const requestOtpHandler = asyncHandler(async (req, res) => {
  const { identifier, purpose } = req.body;

  if (purpose === "login" || purpose === "reset") {
    const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
    const user = await User.findOne(query);
    if (!user) throw new ApiError(404, "USER_NOT_FOUND", "No account found for this identifier");
  }

  const result = await requestOtp(identifier, purpose);
  return ok(res, result, "OTP sent");
});

const resetPasswordHandler = asyncHandler(async (req, res) => {
  const { identifier, code, newPassword } = req.body;

  const verification = await verifyOtp(identifier, "reset", code);
  if (!verification.valid) {
    throw new ApiError(400, "OTP_INVALID", verification.reason);
  }

  const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
  const user = await User.findOne(query);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "No account found for this identifier");

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  const tokens = issueTokenPair(user);
  return ok(res, { user: toPublicUser(user), ...tokens }, "Password reset successfully");
});

const verifyOtpHandler = asyncHandler(async (req, res) => {
  const { identifier, purpose, code, name, role } = req.body;
  const verification = await verifyOtp(identifier, purpose, code);
  if (!verification.valid) {
    throw new ApiError(400, "OTP_INVALID", verification.reason);
  }

  const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
  let user = await User.findOne(query);

  if (!user) {
    if (purpose !== "signup") {
      throw new ApiError(404, "USER_NOT_FOUND", "No account found for this identifier");
    }
    user = await User.create({
      ...query,
      name: name || "New User",
      role: role || ROLES.PATIENT,
      isEmailVerified: isEmail(identifier),
      isPhoneVerified: !isEmail(identifier),
    });
  } else {
    if (isEmail(identifier)) user.isEmailVerified = true;
    else user.isPhoneVerified = true;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = issueTokenPair(user);
  return ok(res, { user: toPublicUser(user), ...tokens }, "Verified");
});

const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
  const user = await User.findOne(query).select("+passwordHash");

  if (!user || !user.passwordHash) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid identifier or password");
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid identifier or password");

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = issueTokenPair(user);
  return ok(res, { user: toPublicUser(user), ...tokens }, "Logged in");
});

const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Invalid or expired refresh token");
  }

  if (await isTokenRevoked(payload.jti)) {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token has been revoked");
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, "INVALID_REFRESH_TOKEN", "User no longer exists");

  return ok(res, {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  });
});

const logout = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body || {};
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await revokeToken(payload.jti, new Date(payload.exp * 1000));
    } catch {
      // Already invalid/expired — nothing to revoke, logout still succeeds.
    }
  }
  return ok(res, null, "Logged out");
});

const googleLogin = asyncHandler(async (req, res) => {
  if (!env.googleOAuth.clientId) {
    throw new ApiError(501, "NOT_CONFIGURED", "Google OAuth is not configured on this server yet");
  }

  const { idToken, role } = req.body;
  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch {
    throw new ApiError(401, "INVALID_GOOGLE_TOKEN", "Could not verify Google ID token");
  }

  let user = await User.findOne({
    authProviders: { $elemMatch: { provider: "google", providerId: profile.providerId } },
  });

  if (!user && profile.email) {
    user = await User.findOne({ email: profile.email });
    if (user) user.authProviders.push({ provider: "google", providerId: profile.providerId });
  }

  if (!user) {
    user = new User({
      name: profile.name || "New User",
      email: profile.email,
      role: role || ROLES.PATIENT,
      isEmailVerified: profile.emailVerified,
      authProviders: [{ provider: "google", providerId: profile.providerId }],
    });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = issueTokenPair(user);
  return ok(res, { user: toPublicUser(user), ...tokens }, "Logged in with Google");
});

module.exports = {
  register,
  requestOtpHandler,
  verifyOtpHandler,
  resetPasswordHandler,
  login,
  refreshToken,
  logout,
  googleLogin,
};
