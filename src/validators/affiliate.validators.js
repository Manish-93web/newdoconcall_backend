const Joi = require("joi");

const createAffiliateSchema = Joi.object({
  name: Joi.string().min(2).max(150).required(),
  contactEmail: Joi.string().email().optional(),
  contactPhone: Joi.string()
    .pattern(/^[0-9+\-\s]{7,15}$/)
    .optional(),
  commissionPercent: Joi.number().min(0).max(100).required(),
});

const updateAffiliateSchema = Joi.object({
  name: Joi.string().min(2).max(150),
  contactEmail: Joi.string().email(),
  contactPhone: Joi.string().pattern(/^[0-9+\-\s]{7,15}$/),
  commissionPercent: Joi.number().min(0).max(100),
  isActive: Joi.boolean(),
}).min(1);

const linkAffiliateSchema = Joi.object({
  doctorId: Joi.string(),
  clinicId: Joi.string(),
}).or("doctorId", "clinicId");

module.exports = { createAffiliateSchema, updateAffiliateSchema, linkAffiliateSchema };
