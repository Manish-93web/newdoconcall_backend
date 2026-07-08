const Joi = require("joi");

const createSubscriptionPlanSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow(""),
  price: Joi.number().min(0).required(),
  billingCycle: Joi.string().valid("annual", "one_time").required(),
  sessionsIncluded: Joi.number().min(0).required(),
  isFreemium: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
});

const updateSubscriptionPlanSchema = Joi.object({
  name: Joi.string(),
  description: Joi.string().allow(""),
  price: Joi.number().min(0),
  billingCycle: Joi.string().valid("annual", "one_time"),
  sessionsIncluded: Joi.number().min(0),
  isFreemium: Joi.boolean(),
  isActive: Joi.boolean(),
}).min(1);

module.exports = { createSubscriptionPlanSchema, updateSubscriptionPlanSchema };
