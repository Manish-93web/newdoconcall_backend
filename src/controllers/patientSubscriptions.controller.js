const PatientSubscription = require("../models/PatientSubscription");
const User = require("../models/User");
const { ok } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const getMine = asyncHandler(async (req, res) => {
  const [subscription, user] = await Promise.all([
    PatientSubscription.findOne({ user: req.user.id, status: "active" })
      .sort({ createdAt: -1 })
      .populate("plan"),
    User.findById(req.user.id).select("healthId"),
  ]);

  return ok(res, { subscription: subscription || null, healthId: user?.healthId || null });
});

module.exports = { getMine };
