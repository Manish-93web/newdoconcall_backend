const Joi = require("joi");

const createReviewSchema = Joi.object({
  targetType: Joi.string().valid("doctor", "clinic", "lab").required(),
  targetId: Joi.string().required(),
  appointmentId: Joi.string().required(),
  rating: Joi.number().min(1).max(5).required(),
  comment: Joi.string().allow("").max(1000),
});

module.exports = { createReviewSchema };
