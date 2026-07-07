const Joi = require("joi");

const createBookingSchema = Joi.object({
  labId: Joi.string().required(),
  forFamilyMemberId: Joi.string().allow(null),
  testIds: Joi.array().items(Joi.string()).min(1).required(),
  collectionType: Joi.string().valid("home", "lab_visit").required(),
  scheduledSlot: Joi.date().iso().required(),
  address: Joi.object({
    line1: Joi.string().allow(""),
    city: Joi.string().allow(""),
    state: Joi.string().allow(""),
    pincode: Joi.string().allow(""),
  }).when("collectionType", { is: "home", then: Joi.required() }),
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid("booked", "sample_collected", "processing", "report_ready", "cancelled").required(),
});

module.exports = { createBookingSchema, updateStatusSchema };
