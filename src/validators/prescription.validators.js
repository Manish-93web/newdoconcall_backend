const Joi = require("joi");

const createPrescriptionSchema = Joi.object({
  appointmentId: Joi.string().required(),
  consultationSessionId: Joi.string().allow(null),
  medicines: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        dosage: Joi.string().allow(""),
        frequency: Joi.string().allow(""),
        durationDays: Joi.number().min(1),
      })
    )
    .min(1)
    .required(),
  diagnosis: Joi.array().items(Joi.string()).default([]),
  labTests: Joi.array().items(Joi.string()).default([]),
  advice: Joi.string().allow(""),
  followUpInstructions: Joi.string().allow(""),
});

module.exports = { createPrescriptionSchema };
