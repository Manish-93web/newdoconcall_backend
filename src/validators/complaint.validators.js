const Joi = require("joi");

const createComplaintSchema = Joi.object({
  against: Joi.object({
    targetType: Joi.string().valid("doctor", "clinic", "lab", "user", "order").required(),
    targetId: Joi.string().required(),
  }).required(),
  category: Joi.string().required(),
  description: Joi.string().required(),
});

const resolveComplaintSchema = Joi.object({
  status: Joi.string().valid("investigating", "resolved", "dismissed").required(),
  resolutionNote: Joi.string().allow(""),
});

module.exports = { createComplaintSchema, resolveComplaintSchema };
