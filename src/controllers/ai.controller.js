const { checkSymptoms } = require("../services/ai/symptomChecker.service");
const { recommendDoctors } = require("../services/ai/doctorRecommendation.service");
const { predictRisk } = require("../services/ai/riskPrediction.service");
const { ok, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const symptomCheck = asyncHandler(async (req, res) => {
  const { symptoms } = req.body;
  if (!symptoms) throw new ApiError(400, "SYMPTOMS_REQUIRED", "symptoms text is required");

  const result = checkSymptoms(symptoms);
  return ok(res, result);
});

const doctorRecommendation = asyncHandler(async (req, res) => {
  const { specializations, lat, lng, radiusKm } = req.body;
  const doctors = await recommendDoctors({
    specializationNames: specializations || [],
    lat,
    lng,
    radiusKm,
  });
  return ok(res, doctors);
});

const riskPrediction = asyncHandler(async (req, res) => {
  const { forFamilyMemberId } = req.query;
  const result = await predictRisk({ userId: req.user.id, forFamilyMemberId });
  return ok(res, result);
});

module.exports = { symptomCheck, doctorRecommendation, riskPrediction };
