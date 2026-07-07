const router = require("express").Router();
const PlatformSetting = require("../models/PlatformSetting");
const { ok } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

// Public, read-only subset of PlatformSetting — fee/commission figures a marketplace
// discloses to participants anyway (doctor listing fee, clinic plan pricing), so no auth.
router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const settings = await PlatformSetting.getSettings();
    return ok(res, {
      doctorListingFee: settings.doctorListingFee,
      consultationCommissionPercent: settings.consultationCommissionPercent,
      pharmacyCommissionPercent: settings.pharmacyCommissionPercent,
      diagnosticMarginPercent: settings.diagnosticMarginPercent,
      clinicSubscriptionPlans: settings.clinicSubscriptionPlans,
    });
  })
);

module.exports = router;
