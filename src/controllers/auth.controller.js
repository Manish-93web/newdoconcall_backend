const bcrypt = require("bcryptjs");
const User = require("../models/User");
const env = require("../config/env");
const { ROLES } = require("../config/constants");
const { issueTokenPair, verifyRefreshToken, signAccessToken, signRefreshToken } = require("../services/auth/jwt.service");
const { requestOtp, verifyOtp } = require("../services/auth/otp.service");
const { revokeToken, isTokenRevoked } = require("../services/auth/tokenBlacklist.service");
const { verifyGoogleIdToken } = require("../services/auth/googleOAuth.service");
const { verifyAppleIdToken } = require("../services/auth/appleOAuth.service");
const { provisionFreemiumSubscription } = require("../services/subscription/subscription.service");
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
    healthId: user.healthId,
    // undefined = full admin; an array (even empty) = capability-scoped sub-admin. Lets
    // the admin web app gate its own nav client-side — see rbac.middleware.js for the
    // server-side enforcement this mirrors.
    adminCapabilities: user.adminCapabilities,
  };
}

// Auto-grants the Freemium plan (1 free session) + generates a Health ID for every new
// patient — satisfies "1st consultation is free" with no purchase step. No-op for other
// roles. Never throws into the caller's response — a missing/misconfigured Freemium plan
// shouldn't block account creation, just means the dashboard shows no plan yet.
async function grantFreemiumIfPatient(user) {
  if (user.role !== ROLES.PATIENT) return;
  try {
    await provisionFreemiumSubscription(user._id);
    // provisionFreemiumSubscription sets healthId on a separately-fetched document —
    // reload it onto this instance so the registration response includes it.
    const refreshed = await User.findById(user._id).select("healthId");
    if (refreshed?.healthId) user.healthId = refreshed.healthId;
  } catch {
    // Best-effort — registration must not fail because of this.
  }
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
  await grantFreemiumIfPatient(user);

  const tokens = issueTokenPair(user);
  return created(res, { user: toPublicUser(user), ...tokens }, "Registered successfully");
});

const requestOtpHandler = asyncHandler(async (req, res) => {
  const { identifier, purpose, platform } = req.body;

  if (purpose === "login" || purpose === "reset") {
    const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
    const user = await User.findOne(query);
    if (!user) throw new ApiError(404, "USER_NOT_FOUND", "No account found for this identifier");
  }

  const result = await requestOtp(identifier, purpose, platform);
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
    await grantFreemiumIfPatient(user);
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

  let isNewUser = false;
  if (!user) {
    user = new User({
      name: profile.name || "New User",
      email: profile.email,
      role: role || ROLES.PATIENT,
      isEmailVerified: profile.emailVerified,
      authProviders: [{ provider: "google", providerId: profile.providerId }],
    });
    isNewUser = true;
  }

  user.lastLoginAt = new Date();
  await user.save();
  if (isNewUser) await grantFreemiumIfPatient(user);

  const tokens = issueTokenPair(user);
  return ok(res, { user: toPublicUser(user), ...tokens }, "Logged in with Google");
});

const appleLogin = asyncHandler(async (req, res) => {
  if (!env.appleOAuth.clientId && !env.appleOAuth.bundleId) {
    throw new ApiError(501, "NOT_CONFIGURED", "Sign in with Apple is not configured on this server yet");
  }

  const { idToken, role, fullName } = req.body;
  let profile;
  try {
    profile = await verifyAppleIdToken(idToken);
  } catch {
    throw new ApiError(401, "INVALID_APPLE_TOKEN", "Could not verify Apple ID token");
  }

  let user = await User.findOne({
    authProviders: { $elemMatch: { provider: "apple", providerId: profile.providerId } },
  });

  if (!user && profile.email) {
    user = await User.findOne({ email: profile.email });
    if (user) user.authProviders.push({ provider: "apple", providerId: profile.providerId });
  }

  let isNewUser = false;
  if (!user) {
    // Apple only ever sends the user's name on their very first authorization, via a
    // separate `user` object the client captures itself (not part of the token) — the
    // client forwards it here as `fullName` so we're not stuck with "New User" forever.
    const name = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(" ") || "New User";
    user = new User({
      name,
      email: profile.email,
      role: role || ROLES.PATIENT,
      isEmailVerified: profile.emailVerified,
      authProviders: [{ provider: "apple", providerId: profile.providerId }],
    });
    isNewUser = true;
  }

  user.lastLoginAt = new Date();
  await user.save();
  if (isNewUser) await grantFreemiumIfPatient(user);

  const tokens = issueTokenPair(user);
  return ok(res, { user: toPublicUser(user), ...tokens }, "Logged in with Apple");
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
  appleLogin,
};
