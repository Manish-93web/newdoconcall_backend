const Joi = require("joi");

const createOrderSchema = Joi.object({
  forFamilyMemberId: Joi.string().allow(null),
  items: Joi.array()
    .items(Joi.object({ medicineId: Joi.string().required(), quantity: Joi.number().min(1).required() }))
    .min(1)
    .required(),
  deliveryAddress: Joi.object({
    line1: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().allow(""),
    pincode: Joi.string().required(),
  }).required(),
  prescriptionUploadId: Joi.string().allow(null),
  linkedPrescriptionId: Joi.string().allow(null),
  refillReminder: Joi.object({
    enabled: Joi.boolean().default(false),
    intervalDays: Joi.number().min(1),
  }).default({ enabled: false }),
});

const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid(
      "placed",
      "prescription_review",
      "confirmed",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "refunded"
    )
    .required(),
  note: Joi.string().allow(""),
});

module.exports = { createOrderSchema, updateStatusSchema };
