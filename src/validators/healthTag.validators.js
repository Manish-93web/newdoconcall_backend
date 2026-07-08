const Joi = require("joi");

const createHealthTagSchema = Joi.object({
  name: Joi.string().required(),
  order: Joi.number().default(0),
  isActive: Joi.boolean().default(true),
});

const updateHealthTagSchema = Joi.object({
  name: Joi.string(),
  order: Joi.number(),
  isActive: Joi.boolean(),
}).min(1);

module.exports = { createHealthTagSchema, updateHealthTagSchema };
