const SubscriptionPlan = require("../models/SubscriptionPlan");
const { ok, created, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const list = asyncHandler(async (req, res) => {
  const plans = await SubscriptionPlan.find({ isActive: true }).sort({ price: 1 });
  return ok(res, plans);
});

const create = asyncHandler(async (req, res) => {
  const plan = await SubscriptionPlan.create(req.body);
  return created(res, plan, "Subscription plan created");
});

const update = asyncHandler(async (req, res) => {
  const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!plan) throw new ApiError(404, "NOT_FOUND", "Subscription plan not found");
  return ok(res, plan, "Subscription plan updated");
});

const remove = asyncHandler(async (req, res) => {
  const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!plan) throw new ApiError(404, "NOT_FOUND", "Subscription plan not found");
  return ok(res, plan, "Subscription plan deactivated");
});

module.exports = { list, create, update, remove };
