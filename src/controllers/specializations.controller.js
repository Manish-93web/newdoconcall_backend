const Specialization = require("../models/Specialization");
const { ok, created } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const list = asyncHandler(async (req, res) => {
  const specializations = await Specialization.find().sort({ name: 1 });
  return ok(res, specializations);
});

const create = asyncHandler(async (req, res) => {
  const specialization = await Specialization.create(req.body);
  return created(res, specialization);
});

module.exports = { list, create };
