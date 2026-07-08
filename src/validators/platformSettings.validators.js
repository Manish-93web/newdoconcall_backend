const Joi = require("joi");

const updatePlatformSettingsSchema = Joi.object({
  doctorListingFee: Joi.number().min(0),
  consultationCommissionPercent: Joi.number().min(0).max(100),
  pharmacyCommissionPercent: Joi.number().min(0).max(100),
  diagnosticMarginPercent: Joi.number().min(0).max(100),
  clinicSubscriptionPlans: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      price: Joi.number().min(0).required(),
      billingCycle: Joi.string().valid("monthly", "yearly").required(),
    })
  ),
}).min(1);

module.exports = { updatePlatformSettingsSchema };
