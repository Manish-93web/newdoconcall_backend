const Joi = require("joi");

const createInvoiceSchema = Joi.object({
  patientId: Joi.string().required(),
  appointmentId: Joi.string().allow(null),
  items: Joi.array()
    .items(
      Joi.object({
        description: Joi.string().required(),
        quantity: Joi.number().min(1).default(1),
        unitAmount: Joi.number().min(0).required(),
      })
    )
    .min(1)
    .required(),
  taxPercent: Joi.number().min(0).max(100).default(0),
  notes: Joi.string().allow(""),
});

module.exports = { createInvoiceSchema };
