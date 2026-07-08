const HealthTag = require("../models/HealthTag");
const { ok, created, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const list = asyncHandler(async (req, res) => {
  const tags = await HealthTag.find({ isActive: true }).sort({ order: 1, name: 1 });
  return ok(res, tags);
});

const create = asyncHandler(async (req, res) => {
  const tag = await HealthTag.create(req.body);
  return created(res, tag, "Health tag created");
});

const update = asyncHandler(async (req, res) => {
  const tag = await HealthTag.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!tag) throw new ApiError(404, "NOT_FOUND", "Health tag not found");
  return ok(res, tag, "Health tag updated");
});

const remove = asyncHandler(async (req, res) => {
  const tag = await HealthTag.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!tag) throw new ApiError(404, "NOT_FOUND", "Health tag not found");
  return ok(res, tag, "Health tag deactivated");
});

module.exports = { list, create, update, remove };
