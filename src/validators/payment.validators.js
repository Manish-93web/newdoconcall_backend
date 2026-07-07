const Joi = require("joi");
const { PAYMENT_PURPOSES } = require("../config/constants");

const createIntentSchema = Joi.object({
  purpose: Joi.string()
    .valid(...Object.values(PAYMENT_PURPOSES))
    .required(),
  referenceId: Joi.string().required(),
  planName: Joi.string().when("purpose", {
    is: PAYMENT_PURPOSES.CLINIC_SUBSCRIPTION,
    then: Joi.required(),
  }),
});

module.exports = { createIntentSchema };
