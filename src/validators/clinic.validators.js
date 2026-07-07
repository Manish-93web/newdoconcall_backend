const Joi = require("joi");

const upsertClinicSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().valid("clinic", "hospital").default("clinic"),
  address: Joi.object({
    line1: Joi.string().allow(""),
    city: Joi.string().allow(""),
    state: Joi.string().allow(""),
    pincode: Joi.string().allow(""),
  }),
  operatingHours: Joi.array().items(
    Joi.object({
      dayOfWeek: Joi.number().min(0).max(6).required(),
      startTime: Joi.string().required(),
      endTime: Joi.string().required(),
    })
  ),
});

const addStaffSchema = Joi.object({
  userId: Joi.string().required(),
});

module.exports = { upsertClinicSchema, addStaffSchema };
