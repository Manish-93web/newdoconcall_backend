const User = require("../models/User");
const { ok, ApiError } = require("../utils/apiResponse");
const { sanitizeText } = require("../utils/sanitize");
const asyncHandler = require("../utils/asyncHandler");

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  return ok(res, user);
});

const updateMe = asyncHandler(async (req, res) => {
  const allowedFields = ["name", "dob", "gender", "addresses", "medicalHistory"];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (updates.medicalHistory?.notes) updates.medicalHistory.notes = sanitizeText(updates.medicalHistory.notes);
  const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
  return ok(res, user, "Profile updated");
});

const registerFcmToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw new ApiError(400, "TOKEN_REQUIRED", "FCM token is required");
  await User.findByIdAndUpdate(req.user.id, { $addToSet: { fcmTokens: token } });
  return ok(res, null, "Token registered");
});

// Called on logout so a shared/re-logged-in device stops receiving the previous
// account's push notifications — without this, a device's FCM token stays registered to
// whoever last logged in even after they sign out.
const removeFcmToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw new ApiError(400, "TOKEN_REQUIRED", "FCM token is required");
  await User.findByIdAndUpdate(req.user.id, { $pull: { fcmTokens: token } });
  return ok(res, null, "Token removed");
});

module.exports = { getMe, updateMe, registerFcmToken, removeFcmToken };
