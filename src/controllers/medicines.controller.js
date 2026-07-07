const Medicine = require("../models/Medicine");
const { ok, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");

const search = asyncHandler(async (req, res) => {
  const { search: term, category, page = 1, limit = 20 } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = {};
  if (category) query.category = category;
  if (term) query.$text = { $search: term };

  const [medicines, total] = await Promise.all([
    Medicine.find(query)
      .sort(term ? { score: { $meta: "textScore" } } : { name: 1 })
      .skip(skip)
      .limit(Number(limit)),
    Medicine.countDocuments(query),
  ]);

  return ok(res, medicines, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const getOne = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id).populate("alternatives");
  if (!medicine) throw new ApiError(404, "NOT_FOUND", "Medicine not found");
  return ok(res, medicine);
});

const getAlternatives = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id).populate("alternatives");
  if (!medicine) throw new ApiError(404, "NOT_FOUND", "Medicine not found");

  let alternatives = medicine.alternatives;
  if (!alternatives.length && medicine.composition) {
    alternatives = await Medicine.find({
      composition: medicine.composition,
      _id: { $ne: medicine._id },
    }).limit(10);
  }

  return ok(res, alternatives);
});

module.exports = { search, getOne, getAlternatives };
