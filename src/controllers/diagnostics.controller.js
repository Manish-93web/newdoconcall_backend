const DiagnosticTest = require("../models/DiagnosticTest");
const Lab = require("../models/Lab");
const { ok, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const listTests = asyncHandler(async (req, res) => {
  const tests = await DiagnosticTest.find().sort({ name: 1 });
  return ok(res, tests);
});

const searchLabs = asyncHandler(async (req, res) => {
  const { lat, lng, radiusKm = 25, testId } = req.query;
  const query = { "verification.status": "verified" };

  if (lat && lng) {
    const EARTH_RADIUS_KM = 6378.1;
    query["address.geo"] = {
      $geoWithin: { $centerSphere: [[Number(lng), Number(lat)], Number(radiusKm) / EARTH_RADIUS_KM] },
    };
  }
  if (testId) query["testsOffered.test"] = testId;

  const labs = await Lab.find(query).populate("testsOffered.test").sort({ ratingAvg: -1 });
  return ok(res, labs);
});

const getLab = asyncHandler(async (req, res) => {
  const lab = await Lab.findById(req.params.id).populate("testsOffered.test");
  if (!lab) throw new ApiError(404, "NOT_FOUND", "Lab not found");
  return ok(res, lab);
});

module.exports = { listTests, searchLabs, getLab };
